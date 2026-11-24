/**
 * Carrega as telas de contexto das rodadas a partir de um arquivo JSON (padrão: exports/round-context.json).
 * O arquivo guarda números internos (faturamento, CRM) e fica FORA do git; este script só lê e grava.
 *
 *   npm run load:contexto                       simula: mostra o que seria gravado, sem gravar nada
 *   npm run load:contexto -- --confirm          grava (atualiza o bloco de mesmo título; cria o que falta)
 *   npm run load:contexto -- --confirm --limpar apaga antes TODOS os blocos das rodadas do arquivo e grava de novo
 *   npm run load:contexto -- --arquivo outro.json
 *
 * Formato: { "blocks": [{ "round": 1, "segment": null | "Saúde", "position": 10, "kind": "cards|table|list|text",
 *            "title": "…", "subtitle": "…", "body": { … }, "source": "…", "note": "…" }] }
 * `round` é a posição da rodada (1 a 4); `segment` é o início do nome do segmento (vazio: vale para todos).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { adminClient, must, root } from "./_client.mjs";
import { isBlockKind, parseBody, cleanTitle, cleanShort } from "../src/lib/round-context";

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const limpar = args.includes("--limpar");
const fileArg = args.includes("--arquivo") ? args[args.indexOf("--arquivo") + 1] : "exports/round-context.json";
const file = path.resolve(root, fileArg);
if (!existsSync(file)) { console.error(`Arquivo não encontrado: ${file}`); process.exit(1); }

interface Raw { round: number; segment: string | null; position?: number; kind: string; title: string; subtitle?: string; body: unknown; source?: string; note?: string }
const raw = (JSON.parse(readFileSync(file, "utf8")) as { blocks?: Raw[] }).blocks;
if (!Array.isArray(raw) || raw.length === 0) { console.error('O arquivo precisa ter { "blocks": [ … ] }.'); process.exit(1); }

const { supabase } = adminClient();
const rounds = must(await supabase.from("meeting_rounds").select("id,position,name").order("position"), "ler rodadas") as { id: string; position: number; name: string }[];
const segments = must(await supabase.from("segments").select("id,name"), "ler segmentos") as { id: string; name: string }[];
const existing = must(await supabase.from("round_context_blocks").select("id,round_id,segment_id,title"), "ler blocos existentes") as { id: string; round_id: string; segment_id: string | null; title: string }[];

const problems: string[] = [];
const plan: { row: Record<string, unknown>; label: string }[] = [];
raw.forEach((b, n) => {
  const where = `bloco ${n + 1} ("${b.title}")`;
  const round = rounds.find((r) => r.position === b.round);
  if (!round) { problems.push(`${where}: não existe a rodada ${b.round}`); return; }
  let segmentId: string | null = null;
  if (b.segment) {
    const hits = segments.filter((s) => s.name.toLowerCase().startsWith(b.segment!.toLowerCase()));
    if (hits.length !== 1) { problems.push(`${where}: segmento "${b.segment}" ${hits.length === 0 ? "não encontrado" : "ambíguo"}`); return; }
    segmentId = hits[0].id;
  }
  if (!isBlockKind(b.kind)) { problems.push(`${where}: tipo "${b.kind}" inválido`); return; }
  const title = cleanTitle(b.title);
  if (!title) { problems.push(`${where}: sem título`); return; }
  const parsed = parseBody(b.kind, b.body);
  if (!parsed.ok) { problems.push(`${where}: ${parsed.error}`); return; }
  plan.push({
    label: `rodada ${round.position} · ${b.segment ?? "todos os segmentos"} · ${title}`,
    row: { round_id: round.id, segment_id: segmentId, position: Number.isInteger(b.position) ? b.position : (n + 1) * 10, kind: b.kind, title, subtitle: cleanShort(b.subtitle, 300), body: parsed.body, source: cleanShort(b.source, 800), note: cleanShort(b.note, 1200) },
  });
});

console.log(`Arquivo: ${path.relative(root, file)} · ${raw.length} blocos`);
if (problems.length) { console.error("\nProblemas encontrados (nada foi gravado):"); for (const p of problems) console.error(" - " + p); process.exit(1); }

const roundsInFile = new Set(plan.map((p) => p.row.round_id as string));
const key = (r: string, s: string | null, t: string) => `${r}|${s ?? ""}|${t}`;
const byKey = new Map(existing.map((e) => [key(e.round_id, e.segment_id, e.title), e.id]));
const toDelete = limpar ? existing.filter((e) => roundsInFile.has(e.round_id)) : [];
const creates = plan.filter((p) => limpar || !byKey.has(key(p.row.round_id as string, p.row.segment_id as string | null, p.row.title as string)));
const updates = limpar ? [] : plan.filter((p) => byKey.has(key(p.row.round_id as string, p.row.segment_id as string | null, p.row.title as string)));

console.log(`\nJá existem ${existing.length} blocos no banco.`);
if (limpar) console.log(`Seriam APAGADOS ${toDelete.length} blocos das rodadas do arquivo e criados ${creates.length}.`);
else console.log(`Seriam criados ${creates.length} e atualizados ${updates.length}.`);
const perRound = new Map<string, number>();
for (const p of plan) { const k = p.label.split(" · ").slice(0, 2).join(" · "); perRound.set(k, (perRound.get(k) ?? 0) + 1); }
for (const [k, n] of perRound) console.log(`  ${k}: ${n}`);

if (!confirm) { console.log("\nSimulação: nada foi gravado. Para gravar, rode de novo com --confirm."); process.exit(0); }

if (toDelete.length) must(await supabase.from("round_context_blocks").delete().in("id", toDelete.map((d) => d.id)), "apagar blocos");
for (const c of creates) must(await supabase.from("round_context_blocks").insert(c.row), `criar "${c.label}"`);
for (const u of updates) must(await supabase.from("round_context_blocks").update(u.row).eq("id", byKey.get(key(u.row.round_id as string, u.row.segment_id as string | null, u.row.title as string))!), `atualizar "${u.label}"`);
console.log(`\nPronto: ${creates.length} criados, ${updates.length} atualizados${toDelete.length ? `, ${toDelete.length} apagados` : ""}.`);
