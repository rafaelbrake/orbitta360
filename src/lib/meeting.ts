import type { Level } from "@/lib/segment";

/** Modo reunião: a sequência de telas do segmento e a navegação. Tudo derivado dos níveis atuais. */
export interface DeckRowLite { offerId: string; name: string; score: number; level: Level | null; reviewNote: string | null; reviewDone: boolean }

export type Slide =
  | { key: "abertura"; kind: "abertura"; title: string }
  | { key: "estrategia"; kind: "estrategia"; title: string }
  | { key: "mesa"; kind: "mesa"; title: string }
  | { key: string; kind: "oferta"; title: string; offerId: string }
  | { key: "apoio"; kind: "apoio"; title: string }
  | { key: "regioes"; kind: "regioes"; title: string }
  | { key: "resumo"; kind: "resumo"; title: string };

/**
 * Telas da reunião: abertura, estratégia, mesa de decisão, uma tela por oferta em Foco (da maior nota para a menor),
 * as ofertas de Apoio (só se houver), a visão das regiões (só se houver) e o fechamento.
 * Mudar o nível de uma oferta muda as telas: quem entra em Foco ganha a sua, quem sai perde.
 */
export function buildSlides(rows: DeckRowLite[], opts: { hasRegional: boolean }): Slide[] {
  const slides: Slide[] = [
    { key: "abertura", kind: "abertura", title: "Abertura" },
    { key: "estrategia", kind: "estrategia", title: "Estratégia" },
    { key: "mesa", kind: "mesa", title: "Mesa de decisão" },
  ];
  const foco = rows.filter((r) => r.level === "foco").sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pt-BR"));
  for (const r of foco) slides.push({ key: `oferta:${r.offerId}`, kind: "oferta", title: r.name, offerId: r.offerId });
  if (rows.some((r) => r.level === "apoio")) slides.push({ key: "apoio", kind: "apoio", title: "Ofertas de apoio" });
  if (opts.hasRegional) slides.push({ key: "regioes", kind: "regioes", title: "O que dizem as regiões" });
  slides.push({ key: "resumo", kind: "resumo", title: "Fechamento" });
  return slides;
}

/** Posição da tela atual depois de a lista mudar: a mesma tela, ou a mesa de decisão se ela saiu (oferta tirada do Foco). */
export function indexOfKey(slides: Slide[], key: string): number {
  const i = slides.findIndex((s) => s.key === key);
  if (i >= 0) return i;
  const mesa = slides.findIndex((s) => s.key === "mesa");
  return mesa >= 0 ? mesa : 0;
}

export const clampIndex = (i: number, length: number) => Math.min(Math.max(i, 0), Math.max(length - 1, 0));

/** Tecla → deslocamento (setas, espaço, PageUp/PageDown) ou salto (Home/End). */
export function keyToMove(key: string, shift = false): { by?: number; to?: "start" | "end" } | null {
  switch (key) {
    case "ArrowRight": case "PageDown": case "ArrowDown": return { by: 1 };
    case "ArrowLeft": case "PageUp": case "ArrowUp": return { by: -1 };
    case " ": return { by: shift ? -1 : 1 };
    case "Home": return { to: "start" };
    case "End": return { to: "end" };
    default: return null;
  }
}

/** Ajustes pedidos que ainda não foram feitos (aparecem no fechamento). */
export function pendingAdjustments<T extends DeckRowLite>(rows: T[]): T[] {
  return rows.filter((r) => (r.reviewNote ?? "").trim() !== "" && !r.reviewDone).sort((a, b) => b.score - a.score);
}

/** "3 de 8" para o contador da tela. */
export const slideCounter = (index: number, length: number) => `${index + 1} de ${length}`;
