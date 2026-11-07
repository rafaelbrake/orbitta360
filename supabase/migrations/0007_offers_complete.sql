-- Orbitta360 — a etapa 1 (conferir as ofertas) só fecha com tipo e modelo de receita preenchidos.
-- Aplique depois de 0001 a 0006.
--
-- Com a base de produtos carregada sem tipo nem modelo, o head completa esses campos na própria
-- tabela da etapa 1. Para o agrupamento e a classificação partirem de dados completos, a
-- confirmação da lista passa a exigir tipo e modelo em todas as ofertas ativas da BU.
-- (O ticket continua opcional.) BUs que já confirmaram a etapa não são afetadas.

create or replace function public.set_bu_step(p_bu uuid, p_step text, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_missing int;
begin
  if not public.bu_editable(p_bu) then
    raise exception 'Sem permissão para alterar as etapas desta BU (período fechado ou já enviada).';
  end if;
  insert into public.bu_progress (bu_id) values (p_bu) on conflict (bu_id) do nothing;

  if p_step = 'offers' then
    if p_done then
      if not exists (select 1 from public.offers o where o.bu_id = p_bu and o.active and not o.is_group) then
        raise exception 'Cadastre ao menos uma oferta antes de confirmar a lista.';
      end if;
      select count(*) into v_missing from public.offers o
       where o.bu_id = p_bu and o.active and not o.is_group
         and (o.offer_type is null or o.revenue_model is null);
      if v_missing > 0 then
        raise exception 'Preencha o tipo e o modelo de receita de todas as ofertas antes de confirmar a lista (faltam % %).',
          v_missing, case when v_missing = 1 then 'oferta' else 'ofertas' end;
      end if;
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
