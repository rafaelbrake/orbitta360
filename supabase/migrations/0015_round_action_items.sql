-- Orbitta360 — itens novos no plano de ação da rodada.
-- Aplique depois de 0001 a 0014.
--
-- Na sala surgem ações que nenhum regional registrou. O líder inclui o item direto na rodada
-- (o que fazer, quem faz, até quando), com o tipo Manter / Mudar / Treinar e a BU, se quiser.
-- Mesmas permissões das demais decisões da rodada: o líder do segmento e a Diretoria escrevem,
-- só enquanto a versão final não está travada. Não altera dados existentes.

create table public.round_action_items (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.segments (id) on delete cascade,
  round_id uuid not null references public.meeting_rounds (id) on delete cascade,
  type text check (type is null or type in ('manter', 'mudar', 'treinar')),
  bu_id uuid references public.bus (id) on delete set null,
  headline text not null check (btrim(headline) <> ''),        -- o item
  action text,                                                  -- como fazer
  owner text,
  due_date date,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index round_action_items_idx on public.round_action_items (segment_id, round_id);

create function public.tg_round_action_item_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.segment_id <> old.segment_id or new.round_id <> old.round_id) then
    raise exception 'Segmento e rodada do item não podem ser alterados.';
  end if;
  if new.bu_id is not null and not exists (
    select 1 from public.meeting_round_bus rb where rb.bu_id = new.bu_id and rb.round_id = new.round_id
  ) then
    raise exception 'A BU do item precisa fazer parte desta rodada.';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger round_action_items_guard before insert or update on public.round_action_items
  for each row execute function public.tg_round_action_item_guard();
create trigger audit_round_action_items after insert or update or delete on public.round_action_items
  for each row execute function public.audit_trigger();

alter table public.round_action_items enable row level security;
create policy round_action_items_read on public.round_action_items for select to authenticated
  using (public.is_admin() or public.is_segment_leader(segment_id));
create policy round_action_items_write on public.round_action_items for all to authenticated
  using (public.segment_editable(segment_id)) with check (public.segment_editable(segment_id));

revoke all on public.round_action_items from anon;
grant select, insert, update, delete on public.round_action_items to authenticated;
revoke execute on function public.tg_round_action_item_guard() from public, anon;
