-- Orbitta360 — ID automático das ofertas passa a funcionar acima de 99 por BU.
-- Aplique depois de 0001 a 0007.
--
-- O gatilho montava o número com lpad(n, 2, '0'), e o lpad CORTA o texto quando ele é maior que o
-- tamanho pedido: a 100ª oferta virava "OF-10", que já existe, e o cadastro falhava por ID repetido.
-- Agora o número tem no mínimo 2 dígitos (OF-01 … OF-99) e cresce normalmente (OF-100, OF-101 …).
-- Não altera nenhum dado existente.

create or replace function public.tg_offer_code() returns trigger
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
  new.code := v_prefix || '-' || case when v_next < 10 then '0' || v_next::text else v_next::text end;
  return new;
end;
$$;
