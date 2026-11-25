-- Orbitta360 — tese e mensagem da apresentação (rascunho da IA, revisado pelo segmento).
-- Aplique depois de 0001 a 0018, ANTES de publicar o código que usa a tabela.
--
-- São campos separados de segment_strategies de propósito: o que o líder escreveu à mão continua lá,
-- sem alteração. O PPT do segmento usa os textos desta tabela.
-- Leem e escrevem a Diretoria Corporativa e o líder do segmento, mesmo com a versão final travada
-- (como o plano de ação nas rodadas). Não altera dados existentes.

create table public.segment_ai_texts (
  segment_id uuid primary key references public.segments (id) on delete cascade,
  thesis text,
  message text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- a mesma função que carimba quem mudou e quando na estratégia do segmento
create trigger segment_ai_texts_guard before insert or update on public.segment_ai_texts
  for each row execute function public.tg_strategy_guard();
create trigger audit_segment_ai_texts after insert or update or delete on public.segment_ai_texts
  for each row execute function public.audit_trigger();

alter table public.segment_ai_texts enable row level security;
create policy segment_ai_texts_access on public.segment_ai_texts for all to authenticated
  using (public.is_admin() or public.is_segment_leader(segment_id))
  with check (public.is_admin() or public.is_segment_leader(segment_id));

revoke all on public.segment_ai_texts from anon;
revoke all on public.segment_ai_texts from authenticated;
grant select, insert, update on public.segment_ai_texts to authenticated;
