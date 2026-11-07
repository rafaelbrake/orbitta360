-- Orbitta360 — ID automático e sequencial das ofertas.
-- Aplique depois de 0001, 0002 e 0003.
--
-- Cada BU tem a sua sequência: OF-01, OF-02, … para ofertas e AG-01, AG-02, … para agrupamentos.
-- O ID é gerado no banco ao inserir (dois cadastros ao mesmo tempo nunca recebem o mesmo número)
-- e fica único dentro da BU. Quem informa um ID próprio (ex.: importação) mantém o que informou.

------------------------------------------------------------------------
-- 1. Arruma os IDs que já existem
------------------------------------------------------------------------
-- IDs repetidos dentro da mesma BU: o mais antigo fica; os demais voltam a "sem ID" e são numerados abaixo.
update public.offers o set code = null
from (
  select id, row_number() over (partition by bu_id, lower(code) order by created_at, id) as rn
  from public.offers where code is not null and btrim(code) <> ''
) d
where o.id = d.id and d.rn > 1;

update public.offers set code = null where code is not null and btrim(code) = '';

-- Quem está sem ID recebe o próximo número da BU, na ordem de criação.
with maxn as (
  select bu_id, is_group,
         coalesce(max(((regexp_match(code, '^(?:OF|AG)-(\d+)$'))[1])::int), 0) as m
  from public.offers
  group by bu_id, is_group
),
todo as (
  select o.id, o.bu_id, o.is_group,
         row_number() over (partition by o.bu_id, o.is_group order by o.created_at, o.id) as rn
  from public.offers o
  where o.code is null
)
update public.offers o
set code = (case when t.is_group then 'AG' else 'OF' end) || '-' || lpad((coalesce(m.m, 0) + t.rn)::text, 2, '0')
from todo t
left join maxn m on m.bu_id = t.bu_id and m.is_group = t.is_group
where o.id = t.id;

------------------------------------------------------------------------
-- 2. Único por BU e gerado automaticamente
------------------------------------------------------------------------
create unique index offers_bu_code_uq on public.offers (bu_id, lower(code)) where code is not null;

create function public.tg_offer_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prefix text; v_next int;
begin
  if new.code is not null and btrim(new.code) <> '' then
    new.code := btrim(new.code);
    return new;
  end if;
  v_prefix := case when new.is_group then 'AG' else 'OF' end;
  -- Uma sequência por BU: o bloqueio impede que dois cadastros simultâneos peguem o mesmo número.
  perform pg_advisory_xact_lock(hashtextextended('offer-code:' || new.bu_id::text, 0));
  select coalesce(max(((regexp_match(o.code, '^' || v_prefix || '-(\d+)$'))[1])::int), 0) + 1
    into v_next
    from public.offers o
   where o.bu_id = new.bu_id and o.code ~ ('^' || v_prefix || '-\d+$');
  new.code := v_prefix || '-' || lpad(v_next::text, 2, '0');
  return new;
end;
$$;
create trigger offers_code before insert on public.offers
  for each row execute function public.tg_offer_code();

revoke execute on function public.tg_offer_code() from public, anon;

------------------------------------------------------------------------
-- 3. O ID não muda depois de criado (as demais proteções de 0003 continuam)
------------------------------------------------------------------------
create or replace function public.tg_offer_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare g record;
begin
  if tg_op = 'UPDATE' then
    if new.bu_id <> old.bu_id then raise exception 'A BU de uma oferta não pode ser trocada depois de criada.'; end if;
    if new.is_group <> old.is_group then raise exception 'Uma oferta não pode virar agrupamento (nem o contrário).'; end if;
    if new.code is distinct from old.code then raise exception 'O ID da oferta é gerado pelo sistema e não pode ser alterado.'; end if;
  end if;
  if new.is_group and new.group_id is not null then
    raise exception 'Um agrupamento não pode fazer parte de outro agrupamento.';
  end if;
  if new.group_id is not null then
    select * into g from public.offers where id = new.group_id;
    if not found or not g.is_group then raise exception 'Agrupamento inválido.'; end if;
    if g.bu_id <> new.bu_id then raise exception 'O agrupamento precisa ser da mesma BU da oferta.'; end if;
  end if;
  return new;
end;
$$;
