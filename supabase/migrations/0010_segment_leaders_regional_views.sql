-- Orbitta360 — líderes de segmento e visão regional dos Diretores Comerciais.
-- Aplique depois de 0001 a 0009.
--
-- Contexto: os diretores regionais (Sul, SP, demais estados…) trazem a visão de campo e, cada um,
-- lidera um segmento na consolidação final (Saúde, Indústria, Varejo, Governo).
--
--  • segment_leaders  — quem lidera cada segmento. É uma ATRIBUIÇÃO, independente do perfil do
--                       usuário (o líder de Governo continua head de BU, por exemplo);
--  • regional_views   — o recado de cada diretor, por segmento: o que funciona e o que não funciona
--                       na região dele;
--  • o líder de um segmento passa a ler a visão regional e os destaques (Manter / Mudar / Treinar)
--    de todos os diretores sobre o segmento dele;
--  • o envio do diretor aceita só a visão regional (os destaques por oferta ficam opcionais).
-- Não altera nenhum dado existente.

------------------------------------------------------------------------
-- 1. Líderes de segmento
------------------------------------------------------------------------
create table public.segment_leaders (
  segment_id uuid not null references public.segments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (segment_id, user_id)
);

create function public.is_segment_leader(p_segment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.segment_leaders l
    join public.profiles p on p.id = l.user_id
    where l.segment_id = p_segment and l.user_id = auth.uid() and p.active
  );
$$;

------------------------------------------------------------------------
-- 2. Visão regional: um recado por diretor e segmento
------------------------------------------------------------------------
create table public.regional_views (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  segment_id uuid not null references public.segments (id) on delete cascade,
  regional text,
  works text,       -- o que funciona na região
  not_works text,   -- o que não funciona / precisa mudar
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, segment_id)
);
create index regional_views_segment_idx on public.regional_views (segment_id);

create function public.tg_regional_view_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.author_id <> old.author_id or new.segment_id <> old.segment_id) then
    raise exception 'Autor e segmento da visão regional não podem ser alterados.';
  end if;
  -- a regional vem do perfil do autor, nunca do cliente
  select p.regional into new.regional from public.profiles p where p.id = new.author_id;
  new.updated_at := now();
  return new;
end;
$$;
create trigger regional_views_guard before insert or update on public.regional_views
  for each row execute function public.tg_regional_view_guard();

create trigger audit_segment_leaders after insert or update or delete on public.segment_leaders
  for each row execute function public.audit_trigger();
create trigger audit_regional_views after insert or update or delete on public.regional_views
  for each row execute function public.audit_trigger('post_submit_mmt');

------------------------------------------------------------------------
-- 3. Permissões
------------------------------------------------------------------------
alter table public.segment_leaders enable row level security;
alter table public.regional_views enable row level security;

-- Todos os usuários logados veem quem lidera cada segmento; só o admin muda.
create policy segment_leaders_read on public.segment_leaders for select to authenticated using (true);
create policy segment_leaders_admin on public.segment_leaders for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Visão regional: o autor, o admin e o líder do segmento leem; o autor edita enquanto o envio não for concluído.
create policy regional_views_read on public.regional_views for select to authenticated
  using (author_id = auth.uid() or public.is_admin() or public.is_segment_leader(segment_id));
create policy regional_views_write on public.regional_views for all to authenticated
  using (public.mmt_editable(author_id)) with check (public.mmt_editable(author_id));

-- O líder também lê os destaques (Manter / Mudar / Treinar) de todos sobre o segmento dele.
create policy mmt_records_leader_read on public.mmt_records for select to authenticated
  using (public.is_segment_leader(segment_id));

revoke all on public.segment_leaders, public.regional_views from anon;
grant select, insert, update, delete on public.segment_leaders, public.regional_views to authenticated;
revoke execute on function public.is_segment_leader(uuid), public.tg_regional_view_guard() from public, anon;
grant execute on function public.is_segment_leader(uuid) to authenticated;

------------------------------------------------------------------------
-- 4. Envio do diretor: basta ter a visão regional OU ao menos um destaque
------------------------------------------------------------------------
create or replace function public.submit_mmt() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.mmt_editable(auth.uid()) then
    raise exception 'Sem permissão para enviar (período fechado ou envio já concluído).';
  end if;
  if not exists (select 1 from public.mmt_records r where r.author_id = auth.uid())
     and not exists (
       select 1 from public.regional_views v
       where v.author_id = auth.uid() and (coalesce(btrim(v.works), '') <> '' or coalesce(btrim(v.not_works), '') <> '')
     ) then
    raise exception 'Preencha a visão da sua região (ao menos um segmento) ou registre um destaque antes de enviar.';
  end if;
  if exists (select 1 from public.mmt_gaps(auth.uid())) then
    raise exception 'Há registros incompletos.';
  end if;
  insert into public.mmt_submissions (user_id, status, submitted_at)
  values (auth.uid(), 'submitted', now())
  on conflict (user_id) do update
    set status = 'submitted', submitted_at = now(), updated_at = now();
end;
$$;
