-- Orbitta360 — o plano de ação da rodada não trava com a versão final.
-- Aplique depois de 0001 a 0016.
--
-- Decisão da Diretoria: as ações surgem durante a reunião e depois dela, então o plano de ação
-- (os itens novos e a decisão sobre cada ponto dos regionais) continua editável mesmo com a versão final
-- do segmento travada. Quem escreve é o mesmo grupo de antes: a Diretoria e o líder do segmento.
--
-- Foco, pitch, anotações da rodada e estratégia continuam sob a trava (segment_editable).
-- Não altera dados existentes.

drop policy round_action_items_write on public.round_action_items;
create policy round_action_items_write on public.round_action_items for all to authenticated
  using (public.is_admin() or public.is_segment_leader(segment_id))
  with check (public.is_admin() or public.is_segment_leader(segment_id));

drop policy mmt_action_plan_write on public.mmt_action_plan;
create policy mmt_action_plan_write on public.mmt_action_plan for all to authenticated
  using (public.is_admin() or public.is_segment_leader(segment_id))
  with check (public.is_admin() or public.is_segment_leader(segment_id));
