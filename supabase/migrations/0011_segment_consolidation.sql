-- Orbitta360 — consolidação por segmento (líder de segmento).
-- Aplique depois de 0001 a 0010.
--
--  • o líder lê AO VIVO a classificação, os pitches e as ofertas das BUs sobre o segmento dele,
--    sem esperar o envio dos heads (somente leitura: quem edita continua sendo o head);
--  • prioridades por oferta em três níveis (foco, apoio, fora do radar), com limite de ofertas
--    em Foco por segmento (padrão 5, configurável pela Diretoria Corporativa);
--  • estratégia do segmento (tese e mensagem aos vendedores);
--  • versão final: o líder ou a Diretoria Corporativa trava; só a Diretoria reabre.
-- Não altera dados existentes.

------------------------------------------------------------------------
-- 1. Leitura ao vivo do líder
------------------------------------------------------------------------
create function public.is_any_segment_leader() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.segment_leaders l
    join public.profiles p on p.id = l.user_id
    where l.user_id = auth.uid() and p.active
  );
$$;

create policy evaluations_leader_read on public.evaluations for select to authenticated
  using (public.is_segment_leader(segment_id));
create policy pitches_leader_read on public.pitches for select to authenticated
  using (public.is_segment_leader(segment_id));
-- Nomes, tipos e tickets das ofertas e o status de envio das BUs: contexto para quem consolida.
create policy offers_leader_read on public.offers for select to authenticated
  using (public.is_any_segment_leader());
create policy submissions_leader_read on public.bu_submissions for select to authenticated
  using (public.is_any_segment_leader());

------------------------------------------------------------------------
-- 2. Estratégia do segmento e prioridades por oferta
------------------------------------------------------------------------
create table public.segment_strategies (
  segment_id uuid primary key references public.segments (id) on delete cascade,
  thesis text,                                   -- tese: onde o segmento vai focar e por quê
  message text,                                  -- mensagem aos vendedores
  foco_limit int not null default 5 check (foco_limit between 1 and 50),
  status text not null default 'draft' check (status in ('draft', 'final')),
  finalized_at timestamptz,
  finalized_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table public.segment_priorities (
  segment_id uuid not null references public.segments (id) on delete cascade,
  offer_id uuid not null references public.offers (id) on delete cascade,
  level text not null check (level in ('foco', 'apoio', 'fora')),
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (segment_id, offer_id)
);
create index segment_priorities_segment_idx on public.segment_priorities (segment_id, level);

-- Quem pode editar a consolidação: admin ou líder do segmento, e só enquanto a versão não está final.
create function public.segment_is_final(p_segment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select s.status = 'final' from public.segment_strategies s where s.segment_id = p_segment), false);
$$;
create function public.segment_editable(p_segment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (public.is_admin() or public.is_segment_leader(p_segment)) and not public.segment_is_final(p_segment);
$$;
create function public.foco_limit_of(p_segment uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select s.foco_limit from public.segment_strategies s where s.segment_id = p_segment), 5);
$$;

-- Limite de Foco e oferta do segmento (as notas da oferta precisam existir no segmento? não: o líder decide).
create function public.tg_priority_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_limit int; v_count int;
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.level = 'foco' and (tg_op = 'INSERT' or old.level is distinct from 'foco') then
    perform pg_advisory_xact_lock(hashtextextended('segment-foco:' || new.segment_id::text, 0));
    v_limit := public.foco_limit_of(new.segment_id);
    select count(*) into v_count from public.segment_priorities p
     where p.segment_id = new.segment_id and p.level = 'foco' and p.offer_id <> new.offer_id;
    if v_count >= v_limit then
      raise exception 'Limite de ofertas em Foco atingido (máximo %). Tire uma oferta do Foco antes de incluir outra.', v_limit;
    end if;
  end if;
  return new;
end;
$$;
create trigger segment_priorities_guard before insert or update on public.segment_priorities
  for each row execute function public.tg_priority_guard();

create function public.tg_strategy_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger segment_strategies_guard before insert or update on public.segment_strategies
  for each row execute function public.tg_strategy_guard();

create trigger audit_segment_strategies after insert or update or delete on public.segment_strategies
  for each row execute function public.audit_trigger();
create trigger audit_segment_priorities after insert or update or delete on public.segment_priorities
  for each row execute function public.audit_trigger();

------------------------------------------------------------------------
-- 3. Permissões
------------------------------------------------------------------------
alter table public.segment_strategies enable row level security;
alter table public.segment_priorities enable row level security;

create policy segment_strategies_read on public.segment_strategies for select to authenticated
  using (public.is_admin() or public.is_segment_leader(segment_id));
create policy segment_strategies_write on public.segment_strategies for all to authenticated
  using (public.segment_editable(segment_id)) with check (public.segment_editable(segment_id));
create policy segment_priorities_read on public.segment_priorities for select to authenticated
  using (public.is_admin() or public.is_segment_leader(segment_id));
create policy segment_priorities_write on public.segment_priorities for all to authenticated
  using (public.segment_editable(segment_id)) with check (public.segment_editable(segment_id));

-- Status, limite de Foco e quem travou só mudam pelas funções abaixo (o texto, direto).
revoke all on public.segment_strategies, public.segment_priorities from anon;
revoke all on public.segment_strategies from authenticated;
grant select on public.segment_strategies to authenticated;
grant insert (segment_id, thesis, message), update (thesis, message) on public.segment_strategies to authenticated;
grant select, insert, update, delete on public.segment_priorities to authenticated;

-- Trava a versão final: o líder do segmento ou a Diretoria Corporativa.
create function public.finalize_segment(p_segment uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_segment_leader(p_segment)) then
    raise exception 'Somente o líder do segmento ou a Diretoria Corporativa pode travar a versão final.';
  end if;
  insert into public.segment_strategies (segment_id, status, finalized_at, finalized_by)
  values (p_segment, 'final', now(), auth.uid())
  on conflict (segment_id) do update set status = 'final', finalized_at = now(), finalized_by = auth.uid();
end;
$$;

-- Reabre a versão final: só a Diretoria Corporativa.
create function public.reopen_segment(p_segment uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Somente a Diretoria Corporativa pode reabrir a versão final.';
  end if;
  update public.segment_strategies set status = 'draft', finalized_at = null, finalized_by = null where segment_id = p_segment;
end;
$$;

-- Limite de ofertas em Foco do segmento: só a Diretoria Corporativa.
create function public.set_foco_limit(p_segment uuid, p_limit int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Somente a Diretoria Corporativa pode mudar o limite de ofertas em Foco.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'O limite de Foco deve estar entre 1 e 50.';
  end if;
  insert into public.segment_strategies (segment_id, foco_limit) values (p_segment, p_limit)
  on conflict (segment_id) do update set foco_limit = excluded.foco_limit;
end;
$$;

revoke execute on function
  public.is_any_segment_leader(), public.segment_is_final(uuid), public.segment_editable(uuid), public.foco_limit_of(uuid),
  public.tg_priority_guard(), public.tg_strategy_guard(),
  public.finalize_segment(uuid), public.reopen_segment(uuid), public.set_foco_limit(uuid, int)
  from public, anon;
grant execute on function
  public.is_any_segment_leader(), public.segment_is_final(uuid), public.segment_editable(uuid), public.foco_limit_of(uuid),
  public.finalize_segment(uuid), public.reopen_segment(uuid), public.set_foco_limit(uuid, int)
  to authenticated;
