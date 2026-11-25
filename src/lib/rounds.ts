import type { Level } from "@/lib/segment";
import type { PitchData } from "@/lib/book";
import type { PitchScore } from "@/lib/pitch-score";

/**
 * Rodadas da reunião de consolidação: cada rodada é um grupo de BUs. O líder do segmento decide Foco / Apoio / Fora
 * (limite de Foco por rodada), lapida o pitch das ofertas em Foco e valida os pontos Manter / Mudar / Treinar
 * dos regionais, que viram o plano de ação.
 */
export interface Round { id: string; position: number; name: string; context: string | null; focoLimit: number; buIds: string[] }

export const DEFAULT_ROUND_LIMIT = 5;
export const CONTEXT_MAX = 8000;

export const DECISIONS = ["validado", "ajustar", "descartado"] as const;
export type Decision = (typeof DECISIONS)[number];
export const DECISION_LABEL: Record<Decision, string> = { validado: "Validado", ajustar: "Ajustar", descartado: "Descartado" };
export const DECISION_STYLE: Record<Decision, string> = {
  validado: "bg-(--brand) text-white",
  ajustar: "bg-(--accent-100) text-(--accent-800)",
  descartado: "bg-slate-200 text-slate-700",
};
export const isDecision = (v: unknown): v is Decision => typeof v === "string" && (DECISIONS as readonly string[]).includes(v);

export const TYPE_LABEL: Record<string, string> = { manter: "Manter", mudar: "Mudar", treinar: "Treinar" };

export const cleanOwner = (v: unknown): string | null => (typeof v === "string" ? v.trim().slice(0, 120) || null : null);
export const cleanActionNote = (v: unknown): string | null => (typeof v === "string" ? v.trim().slice(0, 500) || null : null);
export const cleanContext = (v: unknown): string | null => (typeof v === "string" ? v.trim().slice(0, CONTEXT_MAX) || null : null);

/** Data do formulário (AAAA-MM-DD) → data válida ou null. */
export function cleanDueDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? v.trim() : null;
}

/** Limite de Foco da rodada: inteiro de 1 a 50. */
export function cleanLimit(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null;
}

/** Rodada de uma BU (ou null se a BU não está em nenhum grupo). */
export const roundOfBu = (rounds: Round[], buId: string): Round | null => rounds.find((r) => r.buIds.includes(buId)) ?? null;

/** Uma oferta pontuada no segmento, com a decisão da rodada, na tela da reunião. */
export interface RoundRow {
  offerId: string; code: string | null; name: string; buCode: string; score: number; classCode: string; classLabel: string;
  level: Level | null; note: string | null; pitchValidated: boolean;
  pitch: PitchData | null; pitchSource: "lider" | "head" | null; description: string | null; revenueModel: string | null; ticket: number | null;
  signals: { regional: string; type: string }[];
  /** avaliação do pitch em vigor, quando houver */
  pitchScore?: PitchScore | null;
}

/** Um ponto da rodada: ou um ponto dos regionais (Manter / Mudar / Treinar) com a decisão tomada, ou um item novo incluído na sala. */
export interface ActionItem {
  /** id do registro do regional ou, nos itens novos (custom), id do próprio item */
  recordId: string; custom: boolean; type: string; regional: string; buCode: string; offerName: string | null;
  headline: string | null; evidence: string | null; action: string | null; indicator: string | null; audience: string | null; priority: string | null;
  decision: Decision | null; owner: string; due: string; note: string;
}

export type RoundSlide =
  | { key: "abertura"; kind: "abertura"; title: string }
  | { key: "contexto"; kind: "contexto"; title: string }
  | { key: string; kind: "bloco"; title: string; blockId: string }
  | { key: "mesa"; kind: "mesa"; title: string }
  | { key: string; kind: "oferta"; title: string; offerId: string }
  | { key: "regioes"; kind: "regioes"; title: string }
  | { key: "plano"; kind: "plano"; title: string }
  | { key: "resumo"; kind: "resumo"; title: string };

/**
 * Telas da rodada: abertura, contexto (texto da rodada e blocos com números), o que dizem as regiões (só se houver), mesa de decisão,
 * uma tela por oferta em Foco (da maior nota para a menor), o plano de ação e o fechamento.
 */
export function buildRoundSlides(rows: Pick<RoundRow, "offerId" | "name" | "score" | "level">[], opts: { hasContext: boolean; hasRegional: boolean; blocks?: { id: string; title: string }[] }): RoundSlide[] {
  const slides: RoundSlide[] = [{ key: "abertura", kind: "abertura", title: "Abertura da rodada" }];
  if (opts.hasContext) slides.push({ key: "contexto", kind: "contexto", title: "Contexto" });
  for (const b of opts.blocks ?? []) slides.push({ key: `bloco:${b.id}`, kind: "bloco", title: b.title, blockId: b.id });
  // o que as regiões dizem vem antes de decidir o Foco: ajuda na escolha
  if (opts.hasRegional) slides.push({ key: "regioes", kind: "regioes", title: "O que dizem as regiões" });
  slides.push({ key: "mesa", kind: "mesa", title: "Mesa de decisão" });
  const foco = rows.filter((r) => r.level === "foco").sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pt-BR"));
  for (const r of foco) slides.push({ key: `oferta:${r.offerId}`, kind: "oferta", title: r.name, offerId: r.offerId });
  // o plano sempre existe: mesmo sem pontos dos regionais, o líder pode incluir itens novos
  slides.push({ key: "plano", kind: "plano", title: "Plano de ação" });
  slides.push({ key: "resumo", kind: "resumo", title: "Fechamento da rodada" });
  return slides;
}

export interface RoundStats {
  foco: number; apoio: number; fora: number; semNivel: number;
  pitchesValidados: number; pitchesPendentes: number;
  acoesTotal: number; acoesDecididas: number; acoesPendentes: number;
}

export function roundStats(rows: Pick<RoundRow, "level" | "pitchValidated">[], items: Pick<ActionItem, "decision">[]): RoundStats {
  const count = (l: Level) => rows.filter((r) => r.level === l).length;
  const foco = rows.filter((r) => r.level === "foco");
  const decided = items.filter((i) => i.decision).length;
  return {
    foco: foco.length, apoio: count("apoio"), fora: count("fora"), semNivel: rows.filter((r) => !r.level).length,
    pitchesValidados: foco.filter((r) => r.pitchValidated).length, pitchesPendentes: foco.filter((r) => !r.pitchValidated).length,
    acoesTotal: items.length, acoesDecididas: decided, acoesPendentes: items.length - decided,
  };
}

/** A rodada está concluída quando o Foco foi decidido, os pitches foram validados e todos os pontos dos regionais têm decisão. */
export function roundDone(s: RoundStats): boolean {
  return s.foco > 0 && s.pitchesPendentes === 0 && s.acoesPendentes === 0;
}

/** Linha da visão geral: uma rodada de um segmento. */
export interface RoundProgress { roundId: string; offers: number; stats: RoundStats }

/** Total de ofertas em Foco do segmento, somando as rodadas, e o teto (soma dos limites). */
export function focoTotals(rounds: Pick<Round, "id" | "focoLimit">[], progress: Map<string, { foco: number }>): { foco: number; cap: number } {
  let foco = 0, cap = 0;
  for (const r of rounds) { foco += progress.get(r.id)?.foco ?? 0; cap += r.focoLimit; }
  return { foco, cap };
}

/** Pontos a copiar do rascunho do líder: só ofertas da rodada que ainda não têm nível na rodada; Foco primeiro e respeitando o limite. */
export function planDraftCopy(
  draft: ReadonlyMap<string, Level>, current: ReadonlyMap<string, Level>, offerIdsInRound: ReadonlySet<string>, limit: number,
): { offerId: string; level: Level }[] {
  let slots = Math.max(0, limit - [...current.values()].filter((l) => l === "foco").length);
  const out: { offerId: string; level: Level }[] = [];
  const entries = [...draft.entries()].filter(([id]) => offerIdsInRound.has(id) && !current.has(id)).sort((a, b) => Number(b[1] === "foco") - Number(a[1] === "foco"));
  for (const [offerId, level] of entries) {
    if (level === "foco") { if (slots > 0) { out.push({ offerId, level: "foco" }); slots--; } else out.push({ offerId, level: "apoio" }); }
    else out.push({ offerId, level });
  }
  return out;
}

export interface MmtRecordLite {
  id: string; type: string; bu_id: string; offer_id: string | null; regional: string | null; priority: string | null;
  headline: string | null; evidence: string | null; action: string | null; indicator: string | null; audience: string | null;
}
export interface ActionPlanLite { record_id: string; decision: string; owner: string | null; due_date: string | null; note: string | null }

const PRIORITY_RANK: Record<string, number> = { alta: 0, media: 1, baixa: 2 };

/** Pontos dos regionais das BUs da rodada, com a decisão já tomada. Ordem: prioridade, BU, depois o texto. */
export function buildActionItems(
  records: MmtRecordLite[], plans: ReadonlyMap<string, ActionPlanLite>, roundBuIds: ReadonlySet<string>,
  buCode: ReadonlyMap<string, string>, offerName: ReadonlyMap<string, string>,
): ActionItem[] {
  return records
    .filter((r) => roundBuIds.has(r.bu_id))
    .map((r): ActionItem => {
      const plan = plans.get(r.id);
      return {
        recordId: r.id, custom: false, type: r.type, regional: r.regional || "—", buCode: buCode.get(r.bu_id) ?? "—",
        offerName: r.offer_id ? (offerName.get(r.offer_id) ?? null) : null,
        headline: r.headline, evidence: r.evidence, action: r.action, indicator: r.indicator, audience: r.audience, priority: r.priority,
        decision: plan && isDecision(plan.decision) ? plan.decision : null,
        owner: plan?.owner ?? "", due: plan?.due_date ?? "", note: plan?.note ?? "",
      };
    })
    .sort((a, b) => (PRIORITY_RANK[a.priority ?? ""] ?? 3) - (PRIORITY_RANK[b.priority ?? ""] ?? 3) || a.buCode.localeCompare(b.buCode) || (a.headline ?? "").localeCompare(b.headline ?? "", "pt-BR"));
}

export interface RoundActionItemRow { id: string; type: string | null; bu_id: string | null; headline: string; action: string | null; owner: string | null; due_date: string | null; note: string | null }

/** Item novo (incluído na sala) no mesmo formato dos pontos dos regionais. Já nasce como decidido: foi o líder quem o criou. */
export function customToItem(r: RoundActionItemRow, buCode: ReadonlyMap<string, string>): ActionItem {
  return {
    recordId: r.id, custom: true, type: r.type ?? "", regional: "", buCode: r.bu_id ? (buCode.get(r.bu_id) ?? "—") : "",
    offerName: null, headline: r.headline, evidence: null, action: r.action, indicator: null, audience: null, priority: null,
    decision: "validado", owner: r.owner ?? "", due: r.due_date ?? "", note: r.note ?? "",
  };
}

export const cleanHeadline = (v: unknown): string | null => (typeof v === "string" ? v.trim().slice(0, 300) || null : null);
export const cleanType = (v: unknown): "manter" | "mudar" | "treinar" | null => (v === "manter" || v === "mudar" || v === "treinar" ? v : null);
