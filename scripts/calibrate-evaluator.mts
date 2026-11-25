/**
 * Compara o avaliador da API com as notas aprovadas na calibração (5 pitches). Gasta crédito da API (centavos de dólar)
 * e não grava nada no banco.
 *
 *   npm run calibrar:score
 *
 * Precisa de ANTHROPIC_API_KEY no .env.local e do arquivo exports/pitch-scores.json.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { root } from "./_client.mjs";
import type { PitchData } from "../src/lib/book";
import { evaluatePitch } from "../src/lib/pitch-evaluator";
import { CRITERIA, scoreTotal, type CriterionKey, type Level03 } from "../src/lib/pitch-score";

const env = path.join(root, ".env.local");
if (existsSync(env)) process.loadEnvFile(env);
if (!process.env.ANTHROPIC_API_KEY) { console.error("Defina ANTHROPIC_API_KEY no .env.local"); process.exit(1); }
const file = path.join(root, "exports", "pitch-scores.json");
if (!existsSync(file)) { console.error(`Arquivo não encontrado: ${file}`); process.exit(1); }

interface Entry { bu: string; oferta: string; segmento: string; total: number; levels: Record<CriterionKey, Level03>; pitch: PitchData }
const all = JSON.parse(readFileSync(file, "utf8")) as Entry[];
const find = (bu: string, oferta: string, segmento: string) => all.find((e) => e.bu === bu && e.oferta.startsWith(oferta) && e.segmento.startsWith(segmento));
const sample = [
  find("PRT", "Equipamentos Office", "Saúde"), find("DAT", "MDM (Visão 360) de Pacientes", "Saúde"), find("CYB", "Segurança da Informação - Governança", "Saúde"),
  find("RTX", "Etiquetas Eletrônicas", "Varejo"), find("ITD", "Expenses", "Varejo"),
].filter((e): e is Entry => Boolean(e));
console.log(`Avaliando ${sample.length} pitches da calibração…\n`);

let diff = 0;
for (const e of sample) {
  const r = await evaluatePitch({ segmento: e.segmento, oferta: e.oferta, bu: e.bu, pitch: e.pitch });
  const got = scoreTotal(r.levels);
  diff += Math.abs(got - e.total);
  const changed = CRITERIA.filter((c) => r.levels[c.key] !== e.levels[c.key]).map((c) => `${c.label} ${e.levels[c.key]}→${r.levels[c.key]}`);
  console.log(`${e.bu} · ${e.oferta.slice(0, 45)}\n  calibração ${e.total} · API ${got} · ${r.alerts.length} alertas${changed.length ? `\n  níveis diferentes: ${changed.join(", ")}` : ""}\n`);
}
console.log(`Diferença média: ${Math.round(diff / Math.max(1, sample.length))} pontos`);
