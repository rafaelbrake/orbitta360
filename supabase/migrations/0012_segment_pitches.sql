-- Orbitta360 — pitch editado pelo líder do segmento (a versão que vai para o book de vendas).
-- Aplique depois de 0001 a 0011.
--
-- O texto escrito pelo head continua intacto em `pitches`. O líder edita uma CÓPIA, por oferta e segmento:
-- `segment_pitches`. O book usa a versão do líder quando existe e, senão, a do head.
-- A edição segue a trava da consolidação: depois da versão final, ninguém edita até a Diretoria reabrir.
-- Não altera nenhum dado existente.

create table public.segment_pitches (
  segment_id uuid not null references public.segments (id) on delete cascade,
  offer_id uuid not null references public.offers (id) on delete cascade,
  descricao text,
  dores text,
  proposta_valor text,
  pitch_abertura text,
  pergunta_1 text,
  pergunta_2 text,
  pergunta_3 text,
  cases jsonb not null default '[]'::jsonb,        -- [{cliente, desafio, solucao, resultado}, …]
  perfil_cliente text,
  persona_decisora text,
  persona_influenciadora text,
  funcionarios_min integer,
  funcionarios_max integer,
  modelo_receita text,
  ticket_medio numeric(14, 2),                     -- recorrente: R$/mês · pontual: volume do deal
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (segment_id, offer_id),
  constraint segment_pitches_cases_chk check (jsonb_typeof(cases) = 'array'),
  constraint segment_pitches_modelo_chk check (modelo_receita is null or modelo_receita in ('Recorrente', 'Pontual')),
  constraint segment_pitches_func_min_chk check (funcionarios_min is null or funcionarios_min >= 0),
  constraint segment_pitches_func_max_chk check (funcionarios_max is null or funcionarios_max >= 0),
  constraint segment_pitches_func_range_chk check (funcionarios_min is null or funcionarios_max is null or funcionarios_max >= funcionarios_min),
  constraint segment_pitches_ticket_chk check (ticket_medio is null or ticket_medio >= 0)
);

create function public.tg_segment_pitch_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger segment_pitches_guard before insert or update on public.segment_pitches
  for each row execute function public.tg_segment_pitch_guard();
create trigger audit_segment_pitches after insert or update or delete on public.segment_pitches
  for each row execute function public.audit_trigger();

alter table public.segment_pitches enable row level security;
create policy segment_pitches_read on public.segment_pitches for select to authenticated
  using (public.is_admin() or public.is_segment_leader(segment_id));
create policy segment_pitches_write on public.segment_pitches for all to authenticated
  using (public.segment_editable(segment_id)) with check (public.segment_editable(segment_id));

revoke all on public.segment_pitches from anon;
grant select, insert, update, delete on public.segment_pitches to authenticated;
revoke execute on function public.tg_segment_pitch_guard() from public, anon;
