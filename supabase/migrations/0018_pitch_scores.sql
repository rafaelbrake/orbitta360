-- Orbitta360 — nota do pitch (avaliação por IA) usada nas rodadas.
-- Aplique depois de 0001 a 0017.
--
-- Cada pitch (segmento × oferta) pode ter uma avaliação: nível de 0 a 3 em seis critérios, o porquê de
-- cada um, os alertas (número sem fonte, informação interna) e três melhorias. O total e a faixa são
-- calculados pelo app a partir dos níveis. `content_hash` guarda o texto avaliado: se o pitch mudar,
-- a tela avisa que a nota é do texto antigo.
--
-- Leem a Diretoria Corporativa e o líder do segmento; só a Diretoria escreve (a carga é feita por script).
-- Não altera dados existentes.

create table public.pitch_scores (
  segment_id uuid not null references public.segments (id) on delete cascade,
  offer_id uuid not null references public.offers (id) on delete cascade,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  levels jsonb not null check (jsonb_typeof(levels) = 'object'),
  reasons jsonb not null default '{}'::jsonb check (jsonb_typeof(reasons) = 'object'),
  alerts jsonb not null default '[]'::jsonb check (jsonb_typeof(alerts) = 'array'),
  improvements jsonb not null default '[]'::jsonb check (jsonb_typeof(improvements) = 'array'),
  evaluator text not null check (btrim(evaluator) <> ''),
  evaluated_at timestamptz not null default now(),
  primary key (segment_id, offer_id)
);

create trigger audit_pitch_scores after insert or update or delete on public.pitch_scores
  for each row execute function public.audit_trigger();

alter table public.pitch_scores enable row level security;
create policy pitch_scores_read on public.pitch_scores for select to authenticated
  using (public.is_admin() or public.is_segment_leader(segment_id));
create policy pitch_scores_admin on public.pitch_scores for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.pitch_scores from anon;
grant select, insert, update, delete on public.pitch_scores to authenticated;
