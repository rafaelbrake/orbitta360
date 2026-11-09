/** Consolidação do segmento: níveis de prioridade, limite de Foco e sugestão a partir das faixas dos heads. */
export const LEVELS = ["foco", "apoio", "fora"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABEL: Record<Level, string> = { foco: "Foco", apoio: "Apoio", fora: "Fora do radar" };
export const LEVEL_STYLE: Record<Level, string> = {
  foco: "bg-(--brand) text-white",
  apoio: "bg-(--accent-100) text-(--accent-800)",
  fora: "bg-slate-200 text-slate-700",
};
export const DEFAULT_FOCO_LIMIT = 5;

export const isLevel = (v: unknown): v is Level => typeof v === "string" && (LEVELS as readonly string[]).includes(v);

/** Nível sugerido pela faixa da classificação dos heads (o líder decide). */
export const suggestedLevel = (classCode: string | null | undefined): Level => (classCode === "alta" ? "foco" : classCode === "potencial" ? "apoio" : "fora");

export interface SuggestRow { offerId: string; classCode: string; score: number }

/**
 * Sugere níveis só para as ofertas que ainda não têm nível: as de faixa alta, da maior nota para a menor,
 * ocupam as vagas de Foco que sobram; o excedente vira Apoio; potencial é Apoio; o resto fica fora do radar.
 * Nunca mexe no que o líder já definiu.
 */
export function planSuggestion(rows: SuggestRow[], current: ReadonlyMap<string, Level>, limit: number): Map<string, Level> {
  let slots = Math.max(0, limit - [...current.values()].filter((l) => l === "foco").length);
  const out = new Map<string, Level>();
  for (const r of [...rows].sort((a, b) => b.score - a.score)) {
    if (current.has(r.offerId)) continue;
    const s = suggestedLevel(r.classCode);
    if (s === "foco") {
      if (slots > 0) { out.set(r.offerId, "foco"); slots--; } else out.set(r.offerId, "apoio");
    } else out.set(r.offerId, s);
  }
  return out;
}

export function levelCounts(current: ReadonlyMap<string, Level>): Record<Level, number> {
  const c: Record<Level, number> = { foco: 0, apoio: 0, fora: 0 };
  for (const l of current.values()) c[l]++;
  return c;
}

/** O que falta para a estratégia ter foco claro (aviso, não bloqueio). */
export function strategyChecklist(s: { thesis: string | null; message: string | null }, counts: Record<Level, number>, limit: number) {
  return [
    { ok: (s.thesis ?? "").trim() !== "", label: "Tese do segmento escrita" },
    { ok: (s.message ?? "").trim() !== "", label: "Mensagem aos vendedores escrita" },
    { ok: counts.foco >= 1, label: "Pelo menos uma oferta em Foco" },
    { ok: counts.foco <= limit, label: `Foco dentro do limite (${counts.foco} de ${limit})` },
  ];
}

export const cleanNote = (v: unknown): string | null => (typeof v === "string" ? v.trim().slice(0, 300) || null : null);
export const cleanText = (v: unknown): string | null => (typeof v === "string" ? v.trim().slice(0, 4000) || null : null);
