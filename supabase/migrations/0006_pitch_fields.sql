-- Orbitta360 — nova ficha de pitch.
-- Aplique depois de 0001 a 0005.
--
--  • "Produtos com maior fit" vira a DESCRIÇÃO DA OFERTA (a tela já traz a descrição cadastrada);
--  • o case de sucesso passa a ser uma LISTA (um ou mais cases);
--  • saem: sinergias com outras BUs, nível de aderência e expansão;
--  • o "perfil ideal de cliente" (texto livre) vira campos específicos: perfil/sub-segmento,
--    persona decisora, persona influenciadora, quantidade de funcionários, modelo de receita e ticket
--    (mensal se recorrente, volume do deal se pontual).
-- Os campos que saem são apagados da tabela, mas uma cópia completa dos pitches fica em
-- `pitches_backup_0006` (sem acesso pelo app).

------------------------------------------------------------------------
-- 1. Cópia de segurança dos pitches como estavam
------------------------------------------------------------------------
create table public.pitches_backup_0006 as table public.pitches;
alter table public.pitches_backup_0006 enable row level security; -- sem política: só o service role lê
revoke all on public.pitches_backup_0006 from anon, authenticated;

------------------------------------------------------------------------
-- 2. Estrutura nova
------------------------------------------------------------------------
alter table public.pitches rename column produtos_fit to descricao;

alter table public.pitches
  add column cases jsonb not null default '[]'::jsonb,        -- [{cliente, desafio, solucao, resultado}, …]
  add column perfil_cliente text,
  add column persona_decisora text,
  add column persona_influenciadora text,
  add column funcionarios_min integer,
  add column funcionarios_max integer,
  add column modelo_receita text,
  add column ticket_medio numeric(14, 2);                      -- recorrente: R$/mês · pontual: volume do deal

-- Aproveita o que já foi escrito, sem disparar auditoria nem mudar a data de atualização.
alter table public.pitches disable trigger user;
update public.pitches set
  perfil_cliente = nullif(btrim(icp), ''),
  modelo_receita = case                                  -- mesma regra aplicada às ofertas na migration 0003
    when potencial_modelo is null or btrim(potencial_modelo) = '' then null
    when potencial_modelo ilike '%recorr%' or potencial_modelo ilike '%assinatura%'
      or potencial_modelo ilike '%mensal%' or potencial_modelo ilike '%contrato%' then 'Recorrente'
    else 'Pontual' end,
  cases = case
    when coalesce(btrim(case_cliente), '') <> '' or coalesce(btrim(case_desafio), '') <> ''
      or coalesce(btrim(case_solucao), '') <> '' or coalesce(btrim(case_resultado), '') <> ''
    then jsonb_build_array(jsonb_build_object(
           'cliente', coalesce(case_cliente, ''), 'desafio', coalesce(case_desafio, ''),
           'solucao', coalesce(case_solucao, ''), 'resultado', coalesce(case_resultado, '')))
    else '[]'::jsonb end;
alter table public.pitches enable trigger user;

alter table public.pitches
  drop column icp,
  drop column case_cliente, drop column case_desafio, drop column case_solucao, drop column case_resultado,
  drop column sinergias_bus, drop column sinergias_texto,
  drop column potencial_modelo, drop column potencial_ticket, drop column potencial_expansao,
  drop column aderencia_nivel, drop column aderencia_just;

alter table public.pitches
  add constraint pitches_cases_chk check (jsonb_typeof(cases) = 'array'),
  add constraint pitches_modelo_chk check (modelo_receita is null or modelo_receita in ('Recorrente', 'Pontual')),
  add constraint pitches_func_min_chk check (funcionarios_min is null or funcionarios_min >= 0),
  add constraint pitches_func_max_chk check (funcionarios_max is null or funcionarios_max >= 0),
  add constraint pitches_func_range_chk check (funcionarios_min is null or funcionarios_max is null or funcionarios_max >= funcionarios_min),
  add constraint pitches_ticket_chk check (ticket_medio is null or ticket_medio >= 0);

------------------------------------------------------------------------
-- 3. Pendências de envio com os campos obrigatórios novos
------------------------------------------------------------------------
-- Obrigatórios: descrição da oferta, dores, proposta de valor, pitch de abertura, perfil de cliente e persona decisora.
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
        and coalesce(btrim(p.descricao), '') <> ''
        and coalesce(btrim(p.dores), '') <> ''
        and coalesce(btrim(p.proposta_valor), '') <> ''
        and coalesce(btrim(p.pitch_abertura), '') <> ''
        and coalesce(btrim(p.perfil_cliente), '') <> ''
        and coalesce(btrim(p.persona_decisora), '') <> ''
    );
$$;
