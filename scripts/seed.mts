/**
 * Carrega a configuração inicial (BUs, segmentos, critérios, faixas, parâmetros) a partir de seed/*.json.
 * Seguro para rodar de novo: o que já existe NÃO é sobrescrito (edições do admin são preservadas).
 */
import { adminClient, must, readJson } from "./_client.mjs";

const { url, supabase } = adminClient();
console.log(`Projeto: ${url}`);

const bus = readJson<object[]>("bus.json");
const segments = readJson<object[]>("segments.json");
const criteria = readJson<object[]>("criteria.json");
const bands = readJson<object[]>("bands.json");
const settings = readJson<Record<string, unknown>>("settings.json");

must(await supabase.from("bus").upsert(bus, { onConflict: "code", ignoreDuplicates: true }), "bus");
must(await supabase.from("segments").upsert(segments, { onConflict: "name", ignoreDuplicates: true }), "segments");
must(await supabase.from("criteria").upsert(criteria, { onConflict: "id", ignoreDuplicates: true }), "criteria");
must(await supabase.from("class_bands").upsert(bands, { onConflict: "id", ignoreDuplicates: true }), "class_bands");
must(
  await supabase.from("settings").upsert(Object.entries(settings).map(([key, value]) => ({ key, value })), { onConflict: "key", ignoreDuplicates: true }),
  "settings",
);

console.log("Configuração inicial carregada: 10 BUs, segmentos, 5 critérios, 4 faixas e parâmetros.");
