-- Orbitta360 — rodadas da reunião de consolidação (25 e 26/11).
-- Aplique depois de 0001 a 0013.
--
-- A reunião roda em 4 rodadas, uma por GRUPO DE BUs. Em cada rodada o líder do segmento discute, com os
-- heads do grupo, só as ofertas daquelas BUs:
--   • decide Foco / Apoio / Fora do radar (limite de Foco POR RODADA, padrão 5 → até 20 por segmento);
--   • lapida o pitch das ofertas em Foco e marca "validado com os números de mercado";
--   • valida os pontos Manter / Mudar / Treinar que os diretores regionais registraram sobre aquelas BUs
--     (validar, ajustar ou descartar, com responsável e prazo): isso já é o plano de ação.
--
-- Fica em tabelas NOVAS, separadas das prioridades que o líder já preencheu (segment_priorities não é tocada).
-- A trava da versão final do segmento (segment_editable) vale também aqui. Não altera dados existentes.

------------------------------------------------------------------------
-- 1. Rodadas e os grupos de BUs
------------------------------------------------------------------------
create table public.meeting_rounds (
  id uuid primary key default gen_random_uuid(),
  position smallint not null unique,
  name text not null check (btrim(name) <> ''),
  context text,                                              -- material de contexto da rodada (mercado, visão da empresa)
  foco_limit int not null default 5 check (foco_limit between 1 and 50),
  updated_at timestamptz not null default now()
);

-- Uma BU pertence a uma única rodada.
create table public.meeting_round_bus (
  bu_id uuid primary key references public.bus (id) on delete cascade,
  round_id uuid not null references public.meeting_rounds (id) on delete cascade
);
create index meeting_round_bus_round_idx on public.meeting_round_bus (round_id);

create function public.round_of_offer(p_offer uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select rb.round_id from public.offers o join public.meeting_round_bus rb on rb.bu_id = o.bu_id where o.id = p_offer;
$$;

-- Grupos combinados para a reunião (a Diretoria pode mudar nome, BUs, limite e contexto depois).
insert into public.meeting_rounds (position, name) values
  (1, 'Hardware'), (2, 'Infraestrutura e segurança'), (3, 'Dados e processos'), (4, 'Experiência');
insert into public.meeting_round_bus (bu_id, round_id)
select b.id, r.id
from (values ('PRT', 1), ('LBL', 1), ('ITD', 1), ('ITS', 2), ('CYB', 2), ('DAT', 3), ('PRO', 3), ('BCO', 3), ('CSX', 4), ('RTX', 4)) as m (code, pos)
join public.bus b on b.code = m.code
join public.meeting_rounds r on r.position = m.pos;

------------------------------------------------------------------------
-- 2. Prioridades da rodada (por segmento e oferta)
------------------------------------------------------------------------
create table public.round_priorities (
  segment_id uuid not null references public.segments (id) on delete cascade,
  offer_id uuid not null references public.offers (id) on delete cascade,
  round_id uuid not null references public.meeting_rounds (id) on delete cascade,   -- sempre derivada da BU da oferta
  level text not null check (level in ('foco', 'apoio', 'fora')),
  note text,                                                                          -- por que é Foco / Apoio
  pitch_validated boolean not null default false,                                     -- pitch conferido com os números de mercado
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (segment_id, offer_id)
);
create index round_priorities_round_idx on public.round_priorities (segment_id, round_id, level);

create function public.tg_round_priority_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_round uuid; v_limit int; v_count int;
begin
  if tg_op = 'UPDATE' and (new.segment_id <> old.segment_id or new.offer_id <> old.offer_id) then
    raise exception 'Segmento e oferta da prioridade não podem ser alterados.';
  end if;
  v_round := public.round_of_offer(new.offer_id);
  if v_round is null then raise exception 'Esta oferta não pertence a nenhuma rodada (a BU dela não está em um grupo).'; end if;
  new.round_id := v_round;
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.level = 'foco' and (tg_op = 'INSERT' or old.level is distinct from 'foco') then
    perform pg_advisory_xact_lock(hashtextextended('round-foco:' || new.segment_id::text || v_round::text, 0));
    select r.foco_limit into v_limit from public.meeting_rounds r where r.id = v_round;
    select count(*) into v_count from public.round_priorities p
     where p.segment_id = new.segment_id and p.round_id = v_round and p.level = 'foco' and p.offer_id <> new.offer_id;
    if v_count >= v_limit then
      raise exception 'Limite de ofertas em Foco desta rodada atingido (máximo %). Tire uma oferta do Foco antes de incluir outra.', v_limit;
    end if;
  end if;
  return new;
end;
$$;
create trigger round_priorities_guard before insert or update on public.round_priorities
  for each row execute function public.tg_round_priority_guard();

------------------------------------------------------------------------
-- 3. Anotações da rodada
------------------------------------------------------------------------
create table public.round_notes (
  segment_id uuid not null references public.segments (id) on delete cascade,
  round_id uuid not null references public.meeting_rounds (id) on delete cascade,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (segment_id, round_id)
);
create function public.tg_round_note_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger round_notes_guard before insert or update on public.round_notes
  for each row execute function public.tg_round_note_guard();

------------------------------------------------------------------------
-- 4. Plano de ação: a decisão sobre cada ponto Manter / Mudar / Treinar dos regionais
------------------------------------------------------------------------
create table public.mmt_action_plan (
  record_id uuid primary key references public.mmt_records (id) on delete cascade,
  segment_id uuid not null references public.segments (id) on delete cascade,      -- sempre o segmento do registro
  decision text not null check (decision in ('validado', 'ajustar', 'descartado')),
  owner text,                                                                       -- responsável
  due_date date,                                                                    -- prazo
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index mmt_action_plan_segment_idx on public.mmt_action_plan (segment_id);

create function public.tg_action_plan_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_segment uuid;
begin
  select r.segment_id into v_segment from public.mmt_records r where r.id = new.record_id;
  if v_segment is null then raise exception 'Registro não encontrado.'; end if;
  new.segment_id := v_segment;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger mmt_action_plan_guard before insert or update on public.mmt_action_plan
  for each row execute function public.tg_action_plan_guard();

create trigger audit_meeting_rounds after insert or update or delete on public.meeting_rounds
  for each row execute function public.audit_trigger();
create trigger audit_meeting_round_bus after insert or update or delete on public.meeting_round_bus
  for each row execute function public.audit_trigger();
create trigger audit_round_priorities after insert or update or delete on public.round_priorities
  for each row execute function public.audit_trigger();
create trigger audit_round_notes after insert or update or delete on public.round_notes
  for each row execute function public.audit_trigger();
create trigger audit_mmt_action_plan after insert or update or delete on public.mmt_action_plan
  for each row execute function public.audit_trigger();

------------------------------------------------------------------------
-- 5. Permissões
------------------------------------------------------------------------
alter table public.meeting_rounds enable row level security;
alter table public.meeting_round_bus enable row level security;
alter table public.round_priorities enable row level security;
alter table public.round_notes enable row level security;
alter table public.mmt_action_plan enable row level security;

-- Grupos: a Diretoria e os líderes leem; só a Diretoria muda.
create policy meeting_rounds_read on public.meeting_rounds for select to authenticated
  using (public.is_admin() or public.is_any_segment_leader());
create policy meeting_rounds_admin on public.meeting_rounds for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy meeting_round_bus_read on public.meeting_round_bus for select to authenticated
  using (public.is_admin() or public.is_any_segment_leader());
create policy meeting_round_bus_admin on public.meeting_round_bus for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Decisões da rodada: a Diretoria e o líder do segmento leem; escrevem os mesmos, enquanto a versão final não está travada.
create policy round_priorities_read on public.round_priorities for select to authenticated
  using (public.is_admin() or public.is_segment_leader(segment_id));
create policy round_priorities_write on public.round_priorities for all to authenticated
  using (public.segment_editable(segment_id)) with check (public.segment_editable(segment_id));
create policy round_notes_read on public.round_notes for select to authenticated
  using (public.is_admin() or public.is_segment_leader(segment_id));
create policy round_notes_write on public.round_notes for all to authenticated
  using (public.segment_editable(segment_id)) with check (public.segment_editable(segment_id));
create policy mmt_action_plan_read on public.mmt_action_plan for select to authenticated
  using (public.is_admin() or public.is_segment_leader(segment_id));
create policy mmt_action_plan_write on public.mmt_action_plan for all to authenticated
  using (public.segment_editable(segment_id)) with check (public.segment_editable(segment_id));

revoke all on public.meeting_rounds, public.meeting_round_bus, public.round_priorities, public.round_notes, public.mmt_action_plan from anon;
grant select, insert, update, delete on public.meeting_rounds, public.meeting_round_bus, public.round_priorities, public.round_notes, public.mmt_action_plan to authenticated;
revoke execute on function public.round_of_offer(uuid), public.tg_round_priority_guard(), public.tg_round_note_guard(), public.tg_action_plan_guard() from public, anon;
grant execute on function public.round_of_offer(uuid) to authenticated;
