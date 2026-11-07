-- Orbitta360 — duas ondas de entrega dos heads.
-- Aplique depois de 0001 a 0008. Só ajusta dados (nenhuma tabela ou função muda).
--
--   Onda 1 — entrega até 12/11/2026: Saúde e Indústria
--   Onda 2 — entrega até 19/11/2026: Varejo e Governo
--
-- A onda de cada segmento é o campo `wave` dele; o prazo de cada onda fica em `settings`
-- (chave "deadline_wave:<nome da onda>") e pode ser mudado depois em Configuração.
-- Os quatro segmentos passam a ficar ATIVOS (Indústria e Governo entram na matriz dos heads).
-- O prazo geral dos heads (`deadline_heads`) passa a ser o da última onda: 19/11/2026.
-- Pode ser aplicada mais de uma vez com o mesmo resultado.

update public.segments set wave = 'Onda 1', active = true
 where name ilike 'sa_de%' or name ilike 'ind_stria%';

update public.segments set wave = 'Onda 2', active = true
 where name ilike 'varejo%' or name ilike 'governo%';

insert into public.settings (key, value) values
  ('deadline_wave:Onda 1', to_jsonb('2026-11-12'::text)),
  ('deadline_wave:Onda 2', to_jsonb('2026-11-19'::text)),
  ('deadline_heads',       to_jsonb('2026-11-19'::text))
on conflict (key) do update set value = excluded.value;
