-- Orbitta360 (Plataforma de Priorização do Portfólio 2027) — Fase 1
-- Schema, funções de cálculo, RLS e auditoria.

------------------------------------------------------------------------
-- Tipos
------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'head', 'diretor');
create type public.submission_status as enum ('draft', 'submitted', 'reopened');

------------------------------------------------------------------------
-- Cadastros
------------------------------------------------------------------------
create table public.bus (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  sort smallint not null default 0
);

create table public.segments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  wave text not null default '2027/I',
  leader text,
  active boolean not null default false,
  sort smallint not null default 0
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'head',
  regional text,
  active boolean not null default true,
  can_see_bu_detail boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.user_bus (
  user_id uuid not null references public.profiles (id) on delete cascade,
  bu_id uuid not null references public.bus (id) on delete cascade,
  primary key (user_id, bu_id)
);

create table public.user_segments (
  user_id uuid not null references public.profiles (id) on delete cascade,
  segment_id uuid not null references public.segments (id) on delete cascade,
  primary key (user_id, segment_id)
);

-- Ticket médio da BU (informado uma vez pelo head; base da sugestão de nota do critério 2)
create table public.bu_ticket (
  bu_id uuid primary key references public.bus (id) on delete cascade,
  ticket_medio numeric(14, 2) not null check (ticket_medio >= 0),
  updated_at timestamptz not null default now()
);

------------------------------------------------------------------------
-- Configuração (editável pelo admin)
------------------------------------------------------------------------
create table public.criteria (
  id smallint primary key check (id between 1 and 5),
  name text not null,
  question text not null,
  weight numeric(5, 2) not null check (weight >= 0 and weight <= 100),
  rubric jsonb not null
);

create table public.class_bands (
  id smallint primary key,
  code text not null unique,
  label text not null,
  min_score smallint not null,
  max_score smallint not null,
  direction text not null,
  sort smallint not null,
  check (min_score <= max_score)
);

create table public.settings (
  key text primary key,
  value jsonb not null
);

------------------------------------------------------------------------
-- Ofertas e respostas
------------------------------------------------------------------------
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  bu_id uuid not null references public.bus (id) on delete cascade,
  code text,
  name text not null,
  description text,
  offer_type text,
  revenue_model text,
  ticket_medio numeric(14, 2),
  bcg text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index offers_bu_name_uq on public.offers (bu_id, lower(name));

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  segment_id uuid not null references public.segments (id) on delete cascade,
  bu_id uuid not null references public.bus (id) on delete cascade,
  not_applicable boolean not null default false,
  n1 smallint check (n1 between 1 and 5),
  n2 smallint check (n2 between 1 and 5),
  n3 smallint check (n3 between 1 and 5),
  n4 smallint check (n4 between 1 and 5),
  n5 smallint check (n5 between 1 and 5),
  e1 text, e2 text, e3 text, e4 text, e5 text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (offer_id, segment_id)
);
create index evaluations_bu_idx on public.evaluations (bu_id);

create table public.pitches (
  id uuid primary key default gen_random_uuid(),
  bu_id uuid not null references public.bus (id) on delete cascade,
  segment_id uuid not null references public.segments (id) on delete cascade,
  produtos_fit text,
  dores text,
  proposta_valor text,
  pitch_abertura text,
  pergunta_1 text,
  pergunta_2 text,
  pergunta_3 text,
  case_cliente text,
  case_desafio text,
  case_solucao text,
  case_resultado text,
  sinergias_bus uuid[] not null default '{}',
  sinergias_texto text,
  icp text,
  potencial_modelo text,
  potencial_ticket text,
  potencial_expansao text,
  aderencia_nivel text check (aderencia_nivel in ('Alto', 'Médio', 'Baixo')),
  aderencia_just text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (bu_id, segment_id)
);

create table public.bu_submissions (
  bu_id uuid primary key references public.bus (id) on delete cascade,
  status public.submission_status not null default 'draft',
  submitted_at timestamptz,
  submitted_by uuid,
  reopened_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  table_name text not null,
  row_id text,
  action text not null,
  old_row jsonb,
  new_row jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);

------------------------------------------------------------------------
-- Funções de apoio a permissões (security definer: leem sem recursão de RLS)
------------------------------------------------------------------------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.active
  );
$$;

create function public.can_view_bu(p_bu uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.user_bus ub
    join public.profiles p on p.id = ub.user_id
    where ub.user_id = auth.uid() and ub.bu_id = p_bu
      and p.active and p.role = 'head'
  );
$$;

create function public.period_open() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (s.value)::text::boolean from public.settings s where s.key = 'period_open'), true);
$$;

-- Edição: admin sempre; head só da sua BU, com período aberto e sem envio concluído.
create function public.bu_editable(p_bu uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    public.can_view_bu(p_bu)
    and public.period_open()
    and not exists (
      select 1 from public.bu_submissions s
      where s.bu_id = p_bu and s.status = 'submitted'
    )
  );
$$;

------------------------------------------------------------------------
-- Cálculo de score e classificação (espelha src/lib/scoring.ts)
------------------------------------------------------------------------
create function public.score_of(a smallint, b smallint, c smallint, d smallint, e smallint)
returns smallint language sql stable as $$
  select case
    when a is null or b is null or c is null or d is null or e is null then null
    else round(sum(
      (case cr.id when 1 then a when 2 then b when 3 then c when 4 then d else e end)::numeric / 5 * cr.weight
    ))::smallint
  end
  from public.criteria cr;
$$;

create function public.class_of(p_score smallint) returns text
language sql stable as $$
  select cb.code from public.class_bands cb
  where p_score between cb.min_score and cb.max_score
  order by cb.sort limit 1;
$$;

create view public.evaluations_scored with (security_invoker = true) as
select
  e.id, e.offer_id, e.segment_id, e.bu_id, e.not_applicable,
  e.n1, e.n2, e.n3, e.n4, e.n5,
  e.e1, e.e2, e.e3, e.e4, e.e5,
  e.updated_at,
  s.score,
  public.class_of(s.score) as class_code,
  (
    s.score is not null and e.n4 <= 2
    and s.score >= coalesce((select min_score from public.class_bands where code = 'potencial'), 70)
  ) as specialist_led
from public.evaluations e
cross join lateral (
  select case when e.not_applicable then null
              else public.score_of(e.n1, e.n2, e.n3, e.n4, e.n5) end as score
) s;

------------------------------------------------------------------------
-- Pendências de envio de uma BU
------------------------------------------------------------------------
create function public.submission_gaps(p_bu uuid)
returns table (kind text, offer_id uuid, segment_id uuid, detail text)
language sql stable security definer set search_path = public as $$
  with cells as (
    select o.id as offer_id, o.name as offer_name, sg.id as segment_id, sg.name as segment_name
    from public.offers o
    cross join public.segments sg
    where o.bu_id = p_bu and o.active and sg.active and public.can_view_bu(p_bu)
  ),
  ev as (
    select c.*, e.id as ev_id, e.not_applicable, e.n1, e.n2, e.n3, e.n4, e.n5,
           e.e1, e.e2, e.e3, e.e4, e.e5
    from cells c
    left join public.evaluations e
      on e.offer_id = c.offer_id and e.segment_id = c.segment_id
  )
  select 'nota'::text, offer_id, segment_id,
         offer_name || ' × ' || segment_name || ': avaliação incompleta'
  from ev
  where ev_id is null
     or (not not_applicable and (n1 is null or n2 is null or n3 is null or n4 is null or n5 is null))
  union all
  select 'evidencia'::text, offer_id, segment_id,
         offer_name || ' × ' || segment_name || ': falta evidência para nota 4 ou 5'
  from ev
  where ev_id is not null and not not_applicable
    and ((n1 >= 4 and coalesce(btrim(e1), '') = '')
      or (n2 >= 4 and coalesce(btrim(e2), '') = '')
      or (n3 >= 4 and coalesce(btrim(e3), '') = '')
      or (n4 >= 4 and coalesce(btrim(e4), '') = '')
      or (n5 >= 4 and coalesce(btrim(e5), '') = ''))
  union all
  select 'pitch'::text, null::uuid, sg.id,
         sg.name || ': pitch obrigatório (há oferta com prioridade alta ou potencial)'
  from public.segments sg
  where sg.active and public.can_view_bu(p_bu)
    and exists (
      select 1 from public.evaluations_scored v
      join public.offers o on o.id = v.offer_id and o.active
      where v.bu_id = p_bu and v.segment_id = sg.id
        and v.class_code in ('alta', 'potencial')
    )
    and not exists (
      select 1 from public.pitches p
      where p.bu_id = p_bu and p.segment_id = sg.id
        and coalesce(btrim(p.produtos_fit), '') <> ''
        and coalesce(btrim(p.dores), '') <> ''
        and coalesce(btrim(p.proposta_valor), '') <> ''
        and coalesce(btrim(p.pitch_abertura), '') <> ''
        and coalesce(btrim(p.icp), '') <> ''
        and p.aderencia_nivel is not null
    );
$$;

create function public.submit_bu(p_bu uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.bu_editable(p_bu) then
    raise exception 'Sem permissão para enviar esta BU (ou o período está fechado / já enviada).';
  end if;
  if not exists (select 1 from public.offers o where o.bu_id = p_bu and o.active) then
    raise exception 'Cadastre ao menos uma oferta ativa antes de enviar.';
  end if;
  if exists (select 1 from public.submission_gaps(p_bu)) then
    raise exception 'Há pendências no preenchimento desta BU.';
  end if;
  insert into public.bu_submissions (bu_id, status, submitted_at, submitted_by)
  values (p_bu, 'submitted', now(), auth.uid())
  on conflict (bu_id) do update
    set status = 'submitted', submitted_at = now(), submitted_by = auth.uid(), updated_at = now();
end;
$$;

create function public.reopen_bu(p_bu uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Somente a Diretoria Corporativa pode reabrir um envio.';
  end if;
  update public.bu_submissions
     set status = 'reopened', reopened_at = now(), updated_at = now()
   where bu_id = p_bu;
end;
$$;

------------------------------------------------------------------------
-- Triggers de consistência
------------------------------------------------------------------------
create function public.tg_set_bu_from_offer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select o.bu_id into new.bu_id from public.offers o where o.id = new.offer_id;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger evaluations_set_bu before insert or update on public.evaluations
  for each row execute function public.tg_set_bu_from_offer();

create function public.tg_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger offers_touch before update on public.offers
  for each row execute function public.tg_touch();

create function public.tg_pitch_stamp() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger pitches_stamp before insert or update on public.pitches
  for each row execute function public.tg_pitch_stamp();

-- Perfil automático para cada usuário criado/convidado (perfil mínimo: head sem BU = nada visível)
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------------
-- Auditoria
-- Argumento 'post_submit': só registra depois que a BU já foi enviada alguma vez
-- (notas alteradas após envio ou reabertura). Os demais registram sempre.
------------------------------------------------------------------------
create function public.audit_trigger() returns trigger
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
  end if;
  insert into public.audit_log (user_id, table_name, row_id, action, old_row, new_row)
  values (
    auth.uid(), tg_table_name,
    coalesce(r ->> 'id', r ->> 'key', r ->> 'bu_id'),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_evaluations after insert or update or delete on public.evaluations
  for each row execute function public.audit_trigger('post_submit');
create trigger audit_pitches after insert or update or delete on public.pitches
  for each row execute function public.audit_trigger('post_submit');
create trigger audit_offers after insert or update or delete on public.offers
  for each row execute function public.audit_trigger('post_submit');
create trigger audit_submissions after insert or update or delete on public.bu_submissions
  for each row execute function public.audit_trigger();
create trigger audit_criteria after insert or update or delete on public.criteria
  for each row execute function public.audit_trigger();
create trigger audit_bands after insert or update or delete on public.class_bands
  for each row execute function public.audit_trigger();
create trigger audit_settings after insert or update or delete on public.settings
  for each row execute function public.audit_trigger();
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.audit_trigger();

------------------------------------------------------------------------
-- Pesos devem somar 100 (validado também no admin; aqui no banco via função)
------------------------------------------------------------------------
create function public.save_criteria(p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_total numeric;
begin
  if not public.is_admin() then
    raise exception 'Somente a Diretoria Corporativa pode alterar os critérios.';
  end if;
  select coalesce(sum((i ->> 'weight')::numeric), 0) into v_total from jsonb_array_elements(p_items) i;
  if v_total <> 100 then
    raise exception 'Os pesos precisam somar 100 (soma atual: %).', v_total;
  end if;
  update public.criteria c
     set name = i ->> 'name',
         question = i ->> 'question',
         weight = (i ->> 'weight')::numeric,
         rubric = i -> 'rubric'
    from jsonb_array_elements(p_items) i
   where c.id = (i ->> 'id')::smallint;
end;
$$;

------------------------------------------------------------------------
-- RLS
------------------------------------------------------------------------
alter table public.bus enable row level security;
alter table public.segments enable row level security;
alter table public.profiles enable row level security;
alter table public.user_bus enable row level security;
alter table public.user_segments enable row level security;
alter table public.bu_ticket enable row level security;
alter table public.criteria enable row level security;
alter table public.class_bands enable row level security;
alter table public.settings enable row level security;
alter table public.offers enable row level security;
alter table public.evaluations enable row level security;
alter table public.pitches enable row level security;
alter table public.bu_submissions enable row level security;
alter table public.audit_log enable row level security;

-- Tabelas de configuração: todo usuário autenticado lê; só admin escreve
create policy bus_read on public.bus for select to authenticated using (true);
create policy bus_admin on public.bus for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy segments_read on public.segments for select to authenticated using (true);
create policy segments_admin on public.segments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy criteria_read on public.criteria for select to authenticated using (true);
create policy criteria_admin on public.criteria for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy bands_read on public.class_bands for select to authenticated using (true);
create policy bands_admin on public.class_bands for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy settings_read on public.settings for select to authenticated using (true);
create policy settings_admin on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Perfis e vínculos: cada um vê o próprio; admin vê e altera tudo (ninguém muda o próprio perfil)
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_admin on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy user_bus_read on public.user_bus for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy user_bus_admin on public.user_bus for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy user_segments_read on public.user_segments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy user_segments_admin on public.user_segments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Dados da BU: ver = admin ou head da BU; escrever = bu_editable
create policy bu_ticket_read on public.bu_ticket for select to authenticated
  using (public.can_view_bu(bu_id));
create policy bu_ticket_write on public.bu_ticket for all to authenticated
  using (public.bu_editable(bu_id)) with check (public.bu_editable(bu_id));

create policy offers_read on public.offers for select to authenticated
  using (public.can_view_bu(bu_id));
create policy offers_write on public.offers for all to authenticated
  using (public.bu_editable(bu_id)) with check (public.bu_editable(bu_id));

create policy evaluations_read on public.evaluations for select to authenticated
  using (public.can_view_bu(bu_id));
create policy evaluations_write on public.evaluations for all to authenticated
  using (public.bu_editable(bu_id)) with check (public.bu_editable(bu_id));

create policy pitches_read on public.pitches for select to authenticated
  using (public.can_view_bu(bu_id));
create policy pitches_write on public.pitches for all to authenticated
  using (public.bu_editable(bu_id)) with check (public.bu_editable(bu_id));

-- Envios: leitura da BU; mudanças só pelas funções submit_bu / reopen_bu
create policy submissions_read on public.bu_submissions for select to authenticated
  using (public.can_view_bu(bu_id));

create policy audit_read on public.audit_log for select to authenticated
  using (public.is_admin());

------------------------------------------------------------------------
-- Permissões de acesso às tabelas (RLS faz o filtro fino)
------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
revoke execute on function public.submit_bu(uuid) from public;
revoke execute on function public.reopen_bu(uuid) from public;
revoke execute on function public.save_criteria(jsonb) from public;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.bu_submissions to authenticated;
revoke insert, update, delete on public.bu_submissions from authenticated;
revoke insert, update, delete on public.audit_log from authenticated;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.audit_trigger() from authenticated;
