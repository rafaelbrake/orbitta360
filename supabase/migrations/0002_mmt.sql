-- Fase 2 — Manter / Mudar / Treinar (Diretor Comercial), leitura consolidada e acesso do diretor.
-- Aplique depois de 0001_schema.sql.

------------------------------------------------------------------------
-- Tipos e tabelas
------------------------------------------------------------------------
create type public.mmt_type as enum ('manter', 'mudar', 'treinar');
create type public.mmt_priority as enum ('alta', 'media', 'baixa');

-- Um registro de Manter / Mudar / Treinar.
-- Campos por tipo (as colunas são genéricas; os rótulos mudam na interface):
--   headline  = Prática vencedora (manter) · Problema (mudar) · Competência/conhecimento (treinar)
--   evidence  = Evidência (manter, mudar) · Evidência do gap (treinar)
--   reason    = Por que funcionou? (manter) · Causa-raiz (mudar) · não se aplica (treinar)
--   action    = Manter em 2027 · Mudar em 2027 · Como desenvolver
--   indicator = Indicador
--   audience  = Público (somente treinar)
create table public.mmt_records (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  type public.mmt_type not null,
  segment_id uuid not null references public.segments (id) on delete cascade,
  bu_id uuid not null references public.bus (id) on delete cascade,
  offer_id uuid references public.offers (id) on delete set null,
  regional text,
  priority public.mmt_priority,
  headline text,
  evidence text,
  reason text,
  action text,
  indicator text,
  audience text check (audience in ('AM', 'Especialista', 'Arquiteto', 'Outro')),
  audience_other text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mmt_records_author_idx on public.mmt_records (author_id);
create index mmt_records_segment_idx on public.mmt_records (segment_id, bu_id);

-- Envio do diretor (um por diretor: todos os seus registros de uma vez)
create table public.mmt_submissions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  status public.submission_status not null default 'draft',
  submitted_at timestamptz,
  reopened_at timestamptz,
  updated_at timestamptz not null default now()
);

------------------------------------------------------------------------
-- Permissões
------------------------------------------------------------------------
-- Diretor sem segmentos atribuídos pode registrar em qualquer segmento; com atribuição, só nos seus.
create function public.mmt_scope_ok(p_segment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.user_segments us where us.user_id = auth.uid())
      or exists (select 1 from public.user_segments us where us.user_id = auth.uid() and us.segment_id = p_segment);
$$;

-- Edição: admin sempre; diretor só nos próprios registros, com período aberto e sem envio concluído.
create function public.mmt_editable(p_author uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    p_author = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'diretor' and p.active)
    and public.period_open()
    and not exists (
      select 1 from public.mmt_submissions s where s.user_id = p_author and s.status = 'submitted'
    )
  );
$$;

-- Diretor com "ver detalhe das BUs" liberado pelo admin enxerga as BUs já ENVIADAS (somente leitura).
create function public.director_detail(p_bu uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'diretor' and p.active and p.can_see_bu_detail
  ) and exists (
    select 1 from public.bu_submissions s where s.bu_id = p_bu and s.status = 'submitted'
  );
$$;

------------------------------------------------------------------------
-- Triggers de consistência
------------------------------------------------------------------------
create function public.tg_mmt_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.author_id <> old.author_id or new.type <> old.type then
      raise exception 'Autor e tipo do registro não podem ser alterados.';
    end if;
  end if;
  if new.offer_id is not null and not exists (
    select 1 from public.offers o where o.id = new.offer_id and o.bu_id = new.bu_id
  ) then
    raise exception 'A oferta escolhida não pertence à BU informada.';
  end if;
  -- regional vem do perfil do autor, nunca do cliente
  select p.regional into new.regional from public.profiles p where p.id = new.author_id;
  new.updated_at := now();
  return new;
end;
$$;
create trigger mmt_records_guard before insert or update on public.mmt_records
  for each row execute function public.tg_mmt_guard();

------------------------------------------------------------------------
-- Pendências e envio
------------------------------------------------------------------------
create function public.mmt_gaps(p_user uuid)
returns table (record_id uuid, detail text)
language sql stable security definer set search_path = public as $$
  select r.id,
         initcap(r.type::text) || ' · ' || sg.name || ' · ' || b.code || ': falta ' || m.missing
  from public.mmt_records r
  join public.segments sg on sg.id = r.segment_id
  join public.bus b on b.id = r.bu_id
  cross join lateral (
    select concat_ws(', ',
      case when r.priority is null then 'prioridade' end,
      case when coalesce(btrim(r.headline), '') = '' then 'prática / problema / competência' end,
      case when coalesce(btrim(r.evidence), '') = '' then 'evidência' end,
      case when r.type in ('manter', 'mudar') and coalesce(btrim(r.reason), '') = '' then 'motivo / causa-raiz' end,
      case when coalesce(btrim(r.action), '') = '' then 'ação para 2027' end,
      case when coalesce(btrim(r.indicator), '') = '' then 'indicador' end,
      case when r.type = 'treinar' and r.audience is null then 'público' end,
      case when r.type = 'treinar' and r.audience = 'Outro' and coalesce(btrim(r.audience_other), '') = '' then 'qual público' end
    ) as missing
  ) m
  where r.author_id = p_user
    and (p_user = auth.uid() or public.is_admin())
    and m.missing <> '';
$$;

create function public.submit_mmt() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.mmt_editable(auth.uid()) then
    raise exception 'Sem permissão para enviar (período fechado ou envio já concluído).';
  end if;
  if not exists (select 1 from public.mmt_records r where r.author_id = auth.uid()) then
    raise exception 'Registre ao menos um item de Manter, Mudar ou Treinar antes de enviar.';
  end if;
  if exists (select 1 from public.mmt_gaps(auth.uid())) then
    raise exception 'Há registros incompletos.';
  end if;
  insert into public.mmt_submissions (user_id, status, submitted_at)
  values (auth.uid(), 'submitted', now())
  on conflict (user_id) do update
    set status = 'submitted', submitted_at = now(), updated_at = now();
end;
$$;

create function public.reopen_mmt(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Somente a Diretoria Corporativa pode reabrir um envio.';
  end if;
  update public.mmt_submissions
     set status = 'reopened', reopened_at = now(), updated_at = now()
   where user_id = p_user;
end;
$$;

------------------------------------------------------------------------
-- Leituras para o diretor (sem abrir as tabelas das BUs)
------------------------------------------------------------------------
-- Nomes das ofertas ativas de uma BU, para o campo "oferta" do registro.
create function public.list_offers(p_bu uuid)
returns table (id uuid, code text, name text)
language sql stable security definer set search_path = public as $$
  select o.id, o.code, o.name
  from public.offers o
  where o.bu_id = p_bu and o.active
    and (
      public.is_admin()
      or public.can_view_bu(p_bu)
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'diretor' and p.active)
    )
  order by o.name;
$$;

-- Score consolidado por segmento, SEM o detalhe de cada BU: só contagens e o maior score,
-- considerando apenas BUs com envio concluído.
create function public.segment_overview()
returns table (segment_id uuid, bus_sent int, offers_scored int, n_alta int, n_potencial int, n_secundaria int, n_baixa int, max_score int)
language sql stable security definer set search_path = public as $$
  select sg.id,
         count(distinct v.bu_id)::int,
         count(v.score)::int,
         (count(*) filter (where v.class_code = 'alta'))::int,
         (count(*) filter (where v.class_code = 'potencial'))::int,
         (count(*) filter (where v.class_code = 'secundaria'))::int,
         (count(*) filter (where v.class_code = 'baixa'))::int,
         max(v.score)::int
  from public.segments sg
  left join (
    select ev.*
    from public.evaluations_scored ev
    join public.offers o on o.id = ev.offer_id and o.active
    join public.bu_submissions s on s.bu_id = ev.bu_id and s.status = 'submitted'
    where ev.score is not null
  ) v on v.segment_id = sg.id
  where sg.active
    and (
      public.is_admin()
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'diretor' and p.active)
    )
  group by sg.id, sg.sort
  order by sg.sort;
$$;

------------------------------------------------------------------------
-- Auditoria (estende a função: 'post_submit_mmt' registra só depois do primeiro envio do diretor)
------------------------------------------------------------------------
create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_bu uuid;
begin
  if tg_argv[0] = 'post_submit' then
    v_bu := nullif(r ->> 'bu_id', '')::uuid;
    if not exists (select 1 from public.bu_submissions s where s.bu_id = v_bu) then
      return coalesce(new, old);
    end if;
  elsif tg_argv[0] = 'post_submit_mmt' then
    if not exists (select 1 from public.mmt_submissions s where s.user_id = nullif(r ->> 'author_id', '')::uuid) then
      return coalesce(new, old);
    end if;
  end if;
  insert into public.audit_log (user_id, table_name, row_id, action, old_row, new_row)
  values (
    auth.uid(), tg_table_name,
    coalesce(r ->> 'id', r ->> 'key', r ->> 'bu_id', r ->> 'user_id'),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_mmt_records after insert or update or delete on public.mmt_records
  for each row execute function public.audit_trigger('post_submit_mmt');
create trigger audit_mmt_submissions after insert or update or delete on public.mmt_submissions
  for each row execute function public.audit_trigger();

------------------------------------------------------------------------
-- RLS
------------------------------------------------------------------------
alter table public.mmt_records enable row level security;
alter table public.mmt_submissions enable row level security;

create policy mmt_records_read on public.mmt_records for select to authenticated
  using (author_id = auth.uid() or public.is_admin());
create policy mmt_records_write on public.mmt_records for all to authenticated
  using (public.mmt_editable(author_id))
  with check (public.mmt_editable(author_id) and (public.is_admin() or public.mmt_scope_ok(segment_id)));

create policy mmt_submissions_read on public.mmt_submissions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Diretor com detalhe liberado: leitura das BUs enviadas (as políticas somam às de head/admin)
create policy offers_director_read on public.offers for select to authenticated
  using (public.director_detail(bu_id));
create policy evaluations_director_read on public.evaluations for select to authenticated
  using (public.director_detail(bu_id));
create policy pitches_director_read on public.pitches for select to authenticated
  using (public.director_detail(bu_id));

------------------------------------------------------------------------
-- Permissões de acesso (o Supabase concede ALL por padrão a novas tabelas/funções: restringimos)
------------------------------------------------------------------------
revoke all on public.mmt_records, public.mmt_submissions from anon;
grant select, insert, update, delete on public.mmt_records to authenticated;
grant select on public.mmt_submissions to authenticated;
revoke insert, update, delete on public.mmt_submissions from authenticated;

revoke execute on function
  public.mmt_scope_ok(uuid), public.mmt_editable(uuid), public.director_detail(uuid),
  public.tg_mmt_guard(), public.mmt_gaps(uuid), public.submit_mmt(), public.reopen_mmt(uuid),
  public.list_offers(uuid), public.segment_overview()
  from public, anon;
grant execute on function
  public.mmt_scope_ok(uuid), public.mmt_editable(uuid), public.director_detail(uuid),
  public.mmt_gaps(uuid), public.submit_mmt(), public.reopen_mmt(uuid),
  public.list_offers(uuid), public.segment_overview()
  to authenticated;
