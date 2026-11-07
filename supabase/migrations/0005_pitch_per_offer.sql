-- Orbitta360 — pitch por OFERTA × SEGMENTO.
-- Aplique depois de 0001 a 0004.
--
-- Antes: um pitch por BU × segmento. Agora: uma ficha por oferta (ou agrupamento) em cada segmento
-- em que ela for classificada como Alta ou Potencial. Os pitches antigos não têm oferta para
-- apontar, então ficam guardados em `pitches_legacy` (sem acesso pelo app) e nada é apagado.

------------------------------------------------------------------------
-- 1. Guarda o legado
------------------------------------------------------------------------
alter table public.pitches rename to pitches_legacy;
alter table public.pitches_legacy rename constraint pitches_pkey to pitches_legacy_pkey;
alter table public.pitches_legacy rename constraint pitches_bu_id_segment_id_key to pitches_legacy_bu_id_segment_id_key;
drop trigger if exists audit_pitches on public.pitches_legacy;
drop trigger if exists pitches_stamp on public.pitches_legacy;
drop policy if exists pitches_read on public.pitches_legacy;
drop policy if exists pitches_write on public.pitches_legacy;
drop policy if exists pitches_director_read on public.pitches_legacy;
revoke all on public.pitches_legacy from authenticated, anon; -- RLS segue ligado e sem política: só o service role lê

------------------------------------------------------------------------
-- 2. Pitch por oferta × segmento
------------------------------------------------------------------------
create table public.pitches (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
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
  constraint pitches_offer_segment_uq unique (offer_id, segment_id)
);
create index pitches_bu_idx on public.pitches (bu_id);

-- A BU vem da oferta (nunca do cliente), como nas avaliações.
create trigger pitches_set_bu before insert or update on public.pitches
  for each row execute function public.tg_set_bu_from_offer();

-- Oferta dentro de um agrupamento não tem pitch: o pitch é do agrupamento.
create function public.tg_pitch_scorable() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.offers o where o.id = new.offer_id and o.group_id is not null) then
    raise exception 'Esta oferta faz parte de um agrupamento: o pitch é feito no agrupamento.';
  end if;
  return new;
end;
$$;
create trigger pitches_scorable before insert or update on public.pitches
  for each row execute function public.tg_pitch_scorable();

create trigger audit_pitches after insert or update or delete on public.pitches
  for each row execute function public.audit_trigger('post_submit');

alter table public.pitches enable row level security;
create policy pitches_read on public.pitches for select to authenticated
  using (public.can_view_bu(bu_id));
create policy pitches_write on public.pitches for all to authenticated
  using (public.bu_editable(bu_id) and (public.is_admin() or public.bu_stage_ready(bu_id)))
  with check (public.bu_editable(bu_id) and (public.is_admin() or public.bu_stage_ready(bu_id)));
create policy pitches_director_read on public.pitches for select to authenticated
  using (public.director_detail(bu_id));

revoke all on public.pitches from anon;
grant select, insert, update, delete on public.pitches to authenticated;
revoke execute on function public.tg_pitch_scorable() from public, anon;

------------------------------------------------------------------------
-- 3. Pendências de envio: um pitch por oferta × segmento Alta/Potencial
------------------------------------------------------------------------
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
  -- pitch: cada oferta × segmento em prioridade alta ou potencial precisa da sua ficha completa
  select 'pitch'::text, v.offer_id, v.segment_id,
         o.name || ' × ' || sg.name || ': pitch obrigatório (prioridade alta ou potencial)'
  from public.evaluations_scored v
  join public.offers o on o.id = v.offer_id and o.active and o.group_id is null
  join public.segments sg on sg.id = v.segment_id and sg.active
  where v.bu_id = p_bu and public.can_view_bu(p_bu)
    and v.class_code in ('alta', 'potencial')
    and not exists (
      select 1 from public.pitches p
      where p.offer_id = v.offer_id and p.segment_id = v.segment_id
        and coalesce(btrim(p.produtos_fit), '') <> ''
        and coalesce(btrim(p.dores), '') <> ''
        and coalesce(btrim(p.proposta_valor), '') <> ''
        and coalesce(btrim(p.pitch_abertura), '') <> ''
        and coalesce(btrim(p.icp), '') <> ''
        and p.aderencia_nivel is not null
    );
$$;
