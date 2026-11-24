-- Orbitta360 — telas de contexto das rodadas (mercado, funil, faturamento e perguntas).
-- Aplique depois de 0001 a 0015.
--
-- Antes de decidir o Foco, cada rodada mostra algumas telas de contexto com números do mercado, do funil
-- e do faturamento das BUs do grupo. Cada tela é um BLOCO: cartões, tabela, lista ou texto, com título,
-- fonte e ressalva. O bloco vale para todos os segmentos (segment_id vazio) ou para um segmento só.
--
-- São números internos (faturamento, valor ganho): só a Diretoria Corporativa lê tudo e escreve; cada líder
-- de segmento lê os blocos gerais e os do segmento que lidera. Não altera dados existentes.

create table public.round_context_blocks (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.meeting_rounds (id) on delete cascade,
  segment_id uuid references public.segments (id) on delete cascade,     -- vazio: vale para todos os segmentos
  position int not null default 0,                                        -- ordem dentro da rodada
  kind text not null check (kind in ('cards', 'table', 'list', 'text')),
  title text not null check (btrim(title) <> ''),
  subtitle text,
  body jsonb not null default '{}'::jsonb,                                -- o conteúdo; o formato depende de `kind`
  source text,                                                            -- de onde vêm os números
  note text,                                                              -- ressalva (base, período, o que conferir)
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint round_context_body_chk check (jsonb_typeof(body) = 'object')
);
create index round_context_blocks_idx on public.round_context_blocks (round_id, segment_id, position);

create function public.tg_round_context_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger round_context_blocks_guard before insert or update on public.round_context_blocks
  for each row execute function public.tg_round_context_guard();
create trigger audit_round_context_blocks after insert or update or delete on public.round_context_blocks
  for each row execute function public.audit_trigger();

alter table public.round_context_blocks enable row level security;
create policy round_context_read on public.round_context_blocks for select to authenticated
  using (
    public.is_admin()
    or (segment_id is null and public.is_any_segment_leader())
    or (segment_id is not null and public.is_segment_leader(segment_id))
  );
create policy round_context_admin on public.round_context_blocks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.round_context_blocks from anon;
grant select, insert, update, delete on public.round_context_blocks to authenticated;
revoke execute on function public.tg_round_context_guard() from public, anon;
