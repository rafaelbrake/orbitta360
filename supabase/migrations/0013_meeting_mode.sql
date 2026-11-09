-- Orbitta360 — modo reunião (consolidação ao vivo, 25 e 26/11).
-- Aplique depois de 0001 a 0012.
--
-- Na reunião o líder projeta o segmento, critica o rascunho e fecha a versão final. Para isso:
--  • cada oferta com nível pode receber um AJUSTE pedido na reunião (texto) e ser marcada como feita;
--  • o segmento ganha um espaço para as anotações gerais da reunião.
-- As mesmas permissões da consolidação valem: só o líder do segmento e a Diretoria escrevem, e só
-- enquanto a versão final não está travada. Não altera dados existentes.

alter table public.segment_priorities
  add column review_note text,                           -- ajuste pedido na reunião
  add column review_done boolean not null default false; -- o ajuste já foi feito

alter table public.segment_strategies
  add column meeting_notes text;                         -- anotações gerais da reunião

-- Texto e mensagem já eram editáveis pelo líder; as anotações da reunião entram no mesmo grupo.
grant insert (segment_id, thesis, message, meeting_notes), update (thesis, message, meeting_notes) on public.segment_strategies to authenticated;
