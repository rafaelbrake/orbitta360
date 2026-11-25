/**
 * Carrega as notas dos pitches (padrão: exports/pitch-scores.json, que fica FORA do git).
 *
 *   npm run load:score                       simula: mostra o que seria gravado, sem gravar nada
 *   npm run load:score -- --confirm          grava (uma nota por segmento × oferta; substitui a anterior)
 *   npm run load:score -- --arquivo outro.json
 *
 * Formato: [{ segment_id, offer_id, levels, reasons, alerts, improvements, pitch }], onde `pitch` é o texto avaliado.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { adminClient, must, root } from "./_client.mjs";
import { effectivePitch, type PitchData } from "../src/lib/book";
import { parseScore, scoreBand, scoreTotal } from "../src/lib/pitch-score";
import { pitchHash } from "../src/lib/pitch-score-hash";

const EVALUATOR = "Claude";
const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const file = path.resolve(root, args.includes("--arquivo") ? args[args.indexOf("--arquivo") + 1] : "exports/pitch-scores.json");
if (!existsSync(file)) { console.error(`Arquivo não encontrado: ${file}`); process.exit(1); }

interface Raw { segment_id: string; offer_id: string; oferta?: string; segmento?: string; levels: unknown; reasons: unknown; alerts: unknown; improvements: unknown; pitch: PitchData }
const raw = JSON.parse(readFileSync(file, "utf8")) as Raw[];
if (!Array.isArray(raw) || raw.length === 0) { console.error("O arquivo precisa ter uma lista de avaliações."); process.exit(1); }

const { supabase } = adminClient();
type Row = Record<string, unknown>;
async function all(table: string, cols: string) {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const page = must(await supabase.from(table).select(cols).range(from, from + 999), `ler ${table}`) as unknown as Row[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}
const key = (r: Row | Raw) => `${r.segment_id}|${r.offer_id}`;
const [head, leader] = await Promise.all([all("pitches", "*"), all("segment_pitches", "*")]);
const probe = await supabase.from("pitch_scores").select("segment_id").limit(1);
if (probe.error && confirm) { console.error(`A tabela das notas não está disponível: aplique a migração 0018 no Supabase. (${probe.error.message})`); process.exit(1); }
if (probe.error) console.log("Aviso: a tabela das notas ainda não existe (aplique a migração 0018 antes de gravar).");
const existing = probe.error ? [] : await all("pitch_scores", "segment_id,offer_id");
const H = new Map(head.map((r) => [key(r), r as unknown as PitchData])), L = new Map(leader.map((r) => [key(r), r as unknown as PitchData]));
const known = new Set(existing.map(key));

const problems: string[] = [];
const rows: Row[] = [];
const bands: Record<string, number> = { pronto: 0, ajustar: 0, refazer: 0 };
let changed = 0, gone = 0;
raw.forEach((s, n) => {
  const parsed = parseScore(s);
  if (!parsed || !s.segment_id || !s.offer_id || !s.pitch) { problems.push(`avaliação ${n + 1} (${s.oferta ?? "?"} · ${s.segmento ?? "?"}): incompleta`); return; }
  const current = effectivePitch(H.get(key(s)), L.get(key(s))).pitch;
  if (!current) { gone++; return; }
  const hash = pitchHash(s.pitch);
  if (hash !== pitchHash(current)) changed++;
  bands[scoreBand(scoreTotal(parsed.levels), parsed.alerts)]++;
  rows.push({ segment_id: s.segment_id, offer_id: s.offer_id, content_hash: hash, ...parsed, evaluator: EVALUATOR, evaluated_at: new Date().toISOString() });
});

console.log(`Arquivo: ${path.relative(root, file)} · ${raw.length} avaliações`);
if (problems.length) { console.error("\nProblemas encontrados (nada foi gravado):"); for (const p of problems) console.error(" - " + p); process.exit(1); }
const updates = rows.filter((r) => known.has(`${r.segment_id}|${r.offer_id}`)).length;
console.log(`Seriam criadas ${rows.length - updates} notas e atualizadas ${updates}.`);
console.log(`Prontos: ${bands.pronto} · Ajustar: ${bands.ajustar} · Refazer: ${bands.refazer}`);
if (changed) console.log(`Atenção: ${changed} pitches mudaram depois da avaliação (vão aparecer como "texto anterior").`);
if (gone) console.log(`${gone} avaliações ignoradas: o pitch não existe mais.`);

if (!confirm) { console.log("\nSimulação: nada foi gravado. Para gravar, rode de novo com --confirm."); process.exit(0); }
for (let i = 0; i < rows.length; i += 100) must(await supabase.from("pitch_scores").upsert(rows.slice(i, i + 100), { onConflict: "segment_id,offer_id" }), "gravar notas");
console.log(`\nPronto: ${rows.length} notas gravadas.`);
