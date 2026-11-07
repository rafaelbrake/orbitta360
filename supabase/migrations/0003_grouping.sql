-- Orbitta360 — ofertas padronizadas, agrupamento e etapas da BU.
-- Aplique depois de 0001 e 0002.
--
-- Modelo: um AGRUPAMENTO é uma oferta (is_group = true) que reúne ofertas originais (group_id apontando para ele).
-- Só é classificada a oferta que NÃO está dentro de um agrupamento: o próprio agrupamento ou a oferta avulsa.

------------------------------------------------------------------------
-- 1. Tipo e modelo de receita padronizados
------------------------------------------------------------------------
-- Dados antigos de texto livre são enquadrados na lista nova (o que não é Software/Hardware vira Serviço;
-- o que não é recorrente vira Pontual). Valores vazios continuam vazios.
update public.offers set offer_type = case
    when offer_type is null or btrim(offer_type) = '' then null
    when offer_type ilike '%hardware%' or offer_type ilike '%equipamento%' or offer_type ilike '%dispositivo%' or offer_type ilike '%device%' then 'Hardware'
    when offer_type ilike '%software%' or offer_type ilike '%licen%' or offer_type ilike '%saas%' then 'Software'
    else 'Serviço' end
  where offer_type is not null;

update public.offers set revenue_model = case
    when revenue_model is null or btrim(revenue_model) = '' then null
    when revenue_model ilike '%recorr%' or revenue_model ilike '%assinatura%' or revenue_model ilike '%mensal%' or revenue_model ilike '%contrato%' then 'Recorrente'
    else 'Pontual' end
  where revenue_model is not null;

alter table public.offers
  add constraint offers_type_chk check (offer_type is null or offer_type in ('Software', 'Hardware', 'Serviço')),
  add constraint offers_model_chk check (revenue_model is null or revenue_model in ('Recorrente', 'Pontual'));

------------------------------------------------------------------------
-- 2. Agrupamento
------------------------------------------------------------------------
alter table public.offers
  add column is_group boolean not null default false,
  add column group_id uuid references public.offers (id) on delete set null; -- desfazer o grupo solta os membros
create index offers_group_idx on public.offers (group_id);

create function public.tg_offer_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare g record;
begin
  if tg_op = 'UPDATE' then
    if new.bu_id <> old.bu_id then raise exception 'A BU de uma oferta não pode ser trocada depois de criada.'; end if;
    if new.is_group <> old.is_group then raise exception 'Uma oferta não pode virar agrupamento (nem o contrário).'; end if;
  end if;
  if new.is_group and new.group_id is not null then
    raise exception 'Um agrupamento não pode fazer parte de outro agrupamento.';
  end if;
  if new.group_id is not null then
    select * into g from public.offers where id = new.group_id;
    if not found or not g.is_group then raise exception 'Agrupamento inválido.'; end if;
    if g.bu_id <> new.bu_id then raise exception 'O agrupamento precisa ser da mesma BU da oferta.'; end if;
  end if;
  return new;
end;
$$;
create trigger offers_guard before insert or update on public.offers
  for each row execute function public.tg_offer_guard();

-- Oferta dentro de um agrupamento não é classificada: a nota é do agrupamento.
create function public.tg_evaluation_scorable() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.offers o where o.id = new.offer_id and o.group_id is not null) then
    raise exception 'Esta oferta faz parte de um agrupamento: a classificação é feita no agrupamento.';
  end if;
  return new;
end;
$$;
create trigger evaluations_scorable before insert or update on public.evaluations
  for each row execute function public.tg_evaluation_scorable();

------------------------------------------------------------------------
-- 3. Etapas da BU: 1) conferir ofertas → 2) agrupar → 3) classificar
------------------------------------------------------------------------
create table public.bu_progress (
  bu_id uuid primary key references public.bus (id) on delete cascade,
  offers_confirmed_at timestamptz,
  grouping_confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.bu_progress enable row level security;
create policy bu_progress_read on public.bu_progress for select to authenticated using (public.can_view_bu(bu_id));
revoke all on public.bu_progress from anon;
grant select on public.bu_progress to authenticated;
revoke insert, update, delete on public.bu_progress from authenticated; -- só pela função set_bu_step
create trigger audit_bu_progress after insert or update or delete on public.bu_progress
  for each row execute function public.audit_trigger();

-- BUs que já tinham notas ou envio seguem liberadas (não perdem o trabalho feito).
insert into public.bu_progress (bu_id, offers_confirmed_at, grouping_confirmed_at)
select x.bu_id, now(), now()
from (select bu_id from public.evaluations union select bu_id from public.bu_submissions) x
on conflict (bu_id) do nothing;

create function public.bu_stage_ready(p_bu uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bu_progress p where p.bu_id = p_bu and p.grouping_confirmed_at is not null);
$$;

create function public.set_bu_step(p_bu uuid, p_step text, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.bu_editable(p_bu) then
    raise exception 'Sem permissão para alterar as etapas desta BU (período fechado ou já enviada).';
  end if;
  insert into public.bu_progress (bu_id) values (p_bu) on conflict (bu_id) do nothing;

  if p_step = 'offers' then
    if p_done and not exists (select 1 from public.offers o where o.bu_id = p_bu and o.active and not o.is_group) then
      raise exception 'Cadastre ao menos uma oferta antes de confirmar a lista.';
    end if;
    update public.bu_progress
       set offers_confirmed_at = case when p_done then now() else null end,
           grouping_confirmed_at = case when p_done then grouping_confirmed_at else null end, -- voltar à etapa 1 reabre a 2
           updated_at = now()
     where bu_id = p_bu;
  elsif p_step = 'grouping' then
    if p_done and not exists (select 1 from public.bu_progress p where p.bu_id = p_bu and p.offers_confirmed_at is not null) then
      raise exception 'Confirme a lista de ofertas (etapa 1) antes de concluir o agrupamento.';
    end if;
    update public.bu_progress
       set grouping_confirmed_at = case when p_done then now() else null end, updated_at = now()
     where bu_id = p_bu;
  else
    raise exception 'Etapa desconhecida.';
  end if;
end;
$$;

------------------------------------------------------------------------
-- 4. Operações de agrupamento (atômicas e validadas)
------------------------------------------------------------------------
create function public.create_offer_group(
  p_bu uuid, p_name text, p_type text, p_model text, p_ticket numeric, p_description text, p_members uuid[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_group uuid; v_members uuid[];
begin
  if not public.bu_editable(p_bu) then raise exception 'Sem permissão para agrupar ofertas nesta BU.'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Informe o nome do agrupamento.'; end if;
  select array_agg(distinct m) into v_members from unnest(p_members) m; -- repetidas contam uma vez só
  if coalesce(array_length(v_members, 1), 0) < 2 then raise exception 'Selecione ao menos 2 ofertas diferentes para agrupar.'; end if;
  if (select count(*) from public.offers o
       where o.id = any (v_members) and o.bu_id = p_bu and o.active and not o.is_group and o.group_id is null)
     <> array_length(v_members, 1) then
    raise exception 'Só é possível agrupar ofertas ativas da mesma BU que ainda não estão em outro agrupamento.';
  end if;

  insert into public.offers (bu_id, name, description, offer_type, revenue_model, ticket_medio, is_group)
  values (p_bu, btrim(p_name), nullif(btrim(p_description), ''), p_type, p_model, p_ticket, true)
  returning id into v_group;
  update public.offers set group_id = v_group where id = any (v_members);
  return v_group;
end;
$$;

create function public.add_to_offer_group(p_group uuid, p_members uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_bu uuid; v_members uuid[];
begin
  select bu_id into v_bu from public.offers where id = p_group and is_group;
  if v_bu is null then raise exception 'Agrupamento não encontrado.'; end if;
  if not public.bu_editable(v_bu) then raise exception 'Sem permissão para alterar agrupamentos desta BU.'; end if;
  select array_agg(distinct m) into v_members from unnest(p_members) m;
  if coalesce(array_length(v_members, 1), 0) < 1 then raise exception 'Selecione ao menos 1 oferta.'; end if;
  if (select count(*) from public.offers o
       where o.id = any (v_members) and o.bu_id = v_bu and o.active and not o.is_group and o.group_id is null)
     <> array_length(v_members, 1) then
    raise exception 'Só é possível agrupar ofertas ativas da mesma BU que ainda não estão em outro agrupamento.';
  end if;
  update public.offers set group_id = p_group where id = any (v_members);
end;
$$;

create function public.remove_from_offer_group(p_offer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_group uuid; v_bu uuid;
begin
  select group_id, bu_id into v_group, v_bu from public.offers where id = p_offer;
  if v_group is null then raise exception 'Esta oferta não está em um agrupamento.'; end if;
  if not public.bu_editable(v_bu) then raise exception 'Sem permissão para alterar agrupamentos desta BU.'; end if;
  if (select count(*) from public.offers where group_id = v_group) <= 2 then
    raise exception 'Um agrupamento precisa de ao menos 2 ofertas. Para desfazê-lo, use "Desfazer agrupamento".';
  end if;
  update public.offers set group_id = null where id = p_offer;
end;
$$;

create function public.dissolve_offer_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_bu uuid;
begin
  select bu_id into v_bu from public.offers where id = p_group and is_group;
  if v_bu is null then raise exception 'Agrupamento não encontrado.'; end if;
  if not public.bu_editable(v_bu) then raise exception 'Sem permissão para alterar agrupamentos desta BU.'; end if;
  delete from public.offers where id = p_group; -- os membros voltam a ser ofertas avulsas (FK on delete set null)
end;
$$;

------------------------------------------------------------------------
-- 5. Regras que passam a considerar agrupamento e etapas
------------------------------------------------------------------------
-- Classificação só depois do agrupamento concluído (admin sempre pode).
drop policy evaluations_write on public.evaluations;
create policy evaluations_write on public.evaluations for all to authenticated
  using (public.bu_editable(bu_id) and (public.is_admin() or public.bu_stage_ready(bu_id)))
  with check (public.bu_editable(bu_id) and (public.is_admin() or public.bu_stage_ready(bu_id)));

-- A view só enxerga notas de ofertas classificáveis (fora de agrupamento).
create or replace view public.evaluations_scored with (security_invoker = true) as
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
join public.offers o on o.id = e.offer_id and o.group_id is null
cross join lateral (
  select case when e.not_applicable then null
              else public.score_of(e.n1, e.n2, e.n3, e.n4, e.n5) end as score
) s;

-- Pendências de envio: só ofertas classificáveis; e as etapas precisam estar concluídas.
create or replace function public.submission_gaps(p_bu uuid)
returns table (kind text, offer_id uuid, segment_id uuid, detail text)
language sql stable security definer set search_path = public as $$
  with cells as (
    select o.id as offer_id, o.name as offer_name, sg.id as segment_id, sg.name as segment_name
    from public.offers o
    cross join public.segments sg
    where o.bu_id = p_bu and o.active and o.group_id is null and sg.active and public.can_view_bu(p_bu)
  ),
  ev as (
    select c.*, e.id as ev_id, e.not_applicable, e.n1, e.n2, e.n3, e.n4, e.n5,
           e.e1, e.e2, e.e3, e.e4, e.e5
    from cells c
    left join public.evaluations e
      on e.offer_id = c.offer_id and e.segment_id = c.segment_id
  )
  select 'etapa'::text, null::uuid, null::uuid,
         'Conclua a conferência das ofertas e o agrupamento antes de enviar'
  where public.can_view_bu(p_bu) and not public.bu_stage_ready(p_bu)
  union all
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

create or replace function public.submit_bu(p_bu uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.bu_editable(p_bu) then
    raise exception 'Sem permissão para enviar esta BU (ou o período está fechado / já enviada).';
  end if;
  if not public.bu_stage_ready(p_bu) then
    raise exception 'Conclua a conferência das ofertas e o agrupamento antes de enviar.';
  end if;
  if not exists (select 1 from public.offers o where o.bu_id = p_bu and o.active and o.group_id is null) then
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

-- Lista de ofertas para o "oferta" do Manter/Mudar/Treinar: só as classificáveis.
create or replace function public.list_offers(p_bu uuid)
returns table (id uuid, code text, name text)
language sql stable security definer set search_path = public as $$
  select o.id, o.code, o.name
  from public.offers o
  where o.bu_id = p_bu and o.active and o.group_id is null
    and (
      public.is_admin()
      or public.can_view_bu(p_bu)
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'diretor' and p.active)
    )
  order by o.name;
$$;

------------------------------------------------------------------------
-- Permissões das funções novas (o Supabase concede execução a anon por padrão: restringimos)
------------------------------------------------------------------------
revoke execute on function
  public.tg_offer_guard(), public.tg_evaluation_scorable(), public.bu_stage_ready(uuid), public.set_bu_step(uuid, text, boolean),
  public.create_offer_group(uuid, text, text, text, numeric, text, uuid[]), public.add_to_offer_group(uuid, uuid[]),
  public.remove_from_offer_group(uuid), public.dissolve_offer_group(uuid)
  from public, anon;
grant execute on function
  public.bu_stage_ready(uuid), public.set_bu_step(uuid, text, boolean),
  public.create_offer_group(uuid, text, text, text, numeric, text, uuid[]), public.add_to_offer_group(uuid, uuid[]),
  public.remove_from_offer_group(uuid), public.dissolve_offer_group(uuid)
  to authenticated;
