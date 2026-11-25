import { TYPE_LABEL } from "@/lib/rounds";
import type { PlanOffer, PlanRound, SegmentPlan } from "@/lib/segment-plan";

/**
 * Roteiro da apresentação do segmento, sem depender da biblioteca de PowerPoint: o que entra em cada slide,
 * com que tamanho de letra. O PowerPoint não encolhe texto sozinho ao abrir, então o ajuste é calculado aqui.
 * Ficam de fora, de propósito: nota do pitch e cases (têm nomes de clientes).
 */
export interface Block { label: string; text: string }
export interface Column { blocks: Block[]; size: number }
export interface SummaryBox { title: string; subtitle: string; lines: string[]; size: number }
export interface OfferLine { offer: string; bu: string; pain: string; value: string }
export interface PlanLine { round: string; bu: string; type: string; headline: string; detail: string; owner: string; due: string }

export type Slide =
  | { kind: "capa"; segment: string; leader: string | null; date: string }
  | { kind: "texto"; title: string; subtitle: string; columns: Column[] }
  | { kind: "resumo"; title: string; subtitle: string; boxes: SummaryBox[] }
  | { kind: "rodada"; title: string; subtitle: string; rows: OfferLine[] }
  | { kind: "plano"; title: string; subtitle: string; rows: PlanLine[] };

/** Medidas do slide 16:9, em polegadas. */
export const PAGE = { width: 13.333, height: 7.5, margin: 0.5, top: 1.5, bottom: 6.9 } as const;
export const COLUMN_GAP = 0.4;
export const columnWidth = (columns: number) => (PAGE.width - 2 * PAGE.margin - COLUMN_GAP * (columns - 1)) / columns;
export const PLAN_COLUMNS = [1.0, 0.8, 1.2, 6.33, 1.8, 1.2];
export const ROUND_COLUMNS = [2.9, 4.7, 4.73];

/* ---------- Medida de texto (estimativa conservadora para Calibri) ---------- */
export function countLines(text: string, width: number, size: number): number {
  const perLine = Math.max(8, Math.floor((width * 72) / (size * 0.47)));
  return text.split("\n").reduce((n, p) => n + Math.max(1, Math.ceil(p.length / perLine)), 0);
}
export const lineHeight = (size: number) => (size * 1.22) / 72;
export const blockHeight = (b: Block, width: number, size: number) => lineHeight(size) * countLines(b.text, width - 0.15, size) + 0.12;
export const LABEL_HEIGHT = 0.3;
const BLOCK_GAP = 0.1;
export const columnHeight = (blocks: Block[], width: number, size: number) => blocks.reduce((h, b) => h + LABEL_HEIGHT + blockHeight(b, width, size) + BLOCK_GAP, 0);

const SIZES = [18, 17, 16, 15, 14, 13, 12, 11, 10, 9];
/** Maior letra em que o conteúdo cabe na altura; a menor, se nem assim couber. */
function fitSize(height: (size: number) => number, available: number, max = 18): number {
  return SIZES.filter((s) => s <= max).find((s) => height(s) <= available) ?? SIZES[SIZES.length - 1];
}
function fitColumn(blocks: Block[], width: number, max = 18): Column {
  return { blocks, size: fitSize((s) => columnHeight(blocks, width, s), PAGE.bottom - PAGE.top, max) };
}
/** Colunas do mesmo slide não podem ter letras muito diferentes. */
function even(columns: Column[]): Column[] {
  const limit = Math.min(...columns.map((c) => c.size)) + 3;
  return columns.map((c) => ({ ...c, size: Math.min(c.size, limit) }));
}

/* ---------- Texto ---------- */
export const tidy = (v: string | null | undefined) =>
  (v ?? "").replace(/\r/g, "").replace(/\*\*|__|`/g, "").replace(/^[ \t]*#{1,4}[ \t]*/gm, "").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();

const BULLET = /^\s*(?:[•·▪*\-–—]|\d{1,2}[.)])\s+/;
/** Várias linhas ou tópicos viram uma frase só, cortada na palavra, para o resumo da rodada. */
export function summarize(v: string | null | undefined, max = 200): string {
  const parts = tidy(v).split("\n").map((l) => l.replace(BULLET, "").trim()).filter(Boolean);
  const one = parts.reduce((out, p) => (out ? `${out}${/[.:;!?]$/.test(out) ? "" : ";"} ${p}` : p), "");
  if (one.length <= max) return one || "—";
  const cut = one.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > max / 2 ? space : cut.length).replace(/[\s.,;:]+$/, "")}…`;
}

const brDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "—");
export const longDate = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" }).format(d);

const chunk = <T>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
const part = (title: string, i: number, total: number) => (total > 1 ? `${title} (${i + 1}/${total})` : title);

/* ---------- Slides ---------- */
function thesisSlides(plan: SegmentPlan): Slide[] {
  const blocks = [
    { label: "Onde vamos focar e por quê", text: tidy(plan.thesis) },
    { label: "Mensagem aos vendedores", text: tidy(plan.message) },
  ].filter((b) => b.text);
  if (!blocks.length) return [];
  const title = "Tese do segmento";
  const together = blocks.map((b) => fitColumn([b], columnWidth(blocks.length)));
  if (together.every((c) => c.size >= 13)) return [{ kind: "texto", title, subtitle: "", columns: even(together) }];
  return blocks.map((b, i): Slide => ({ kind: "texto", title: part(title, i, blocks.length), subtitle: "", columns: [fitColumn([b], columnWidth(1))] }));
}

function summarySlides(plan: SegmentPlan): Slide[] {
  const total = plan.rounds.reduce((n, r) => n + r.foco.length, 0);
  const pages = chunk(plan.rounds, 4);
  return pages.map((rounds, i): Slide => ({
    kind: "resumo", title: part("Ofertas em Foco", i, pages.length),
    subtitle: total === 1 ? "1 oferta escolhida nas rodadas" : `${total} ofertas escolhidas nas rodadas`,
    boxes: rounds.map((r) => {
      const lines = r.foco.length ? r.foco.map((o) => `${o.name} · ${o.buCode}`) : ["Nenhuma oferta em Foco"];
      const width = columnWidth(2) - 0.3;
      return { title: `Rodada ${r.position} · ${r.name}`, subtitle: r.buCodes.join(" · "), lines, size: fitSize((s) => countLines(lines.join("\n"), width, s) * lineHeight(s), 1.8, 15) };
    }),
  }));
}

function roundSlides(round: PlanRound): Slide[] {
  const pages = chunk(round.foco, 5);
  return pages.map((offers, i): Slide => ({
    kind: "rodada", title: part(`Rodada ${round.position} · ${round.name}`, i, pages.length), subtitle: `Ofertas em Foco · ${round.buCodes.join(" · ")}`,
    rows: offers.map((o) => ({ offer: o.name, bu: o.buCode, pain: summarize(o.pitch?.dores), value: summarize(o.pitch?.proposta_valor) })),
  }));
}

export function planRowHeight(l: PlanLine): number {
  const point = countLines(l.headline, PLAN_COLUMNS[3] - 0.15, 11) + (l.detail ? countLines(l.detail, PLAN_COLUMNS[3] - 0.15, 11) : 0);
  const owner = countLines(l.owner, PLAN_COLUMNS[4] - 0.15, 11);
  const type = countLines(l.type, PLAN_COLUMNS[2] - 0.15, 11);
  return Math.max(point, owner, type) * lineHeight(11) + 0.14;
}

function planSlides(rounds: PlanRound[]): Slide[] {
  const lines: PlanLine[] = rounds.flatMap((r) => r.items.map((i) => {
    const detail = [i.action && summarize(i.action, 220), i.note && `Observação: ${summarize(i.note, 160)}`].filter(Boolean).join("\n");
    const type = TYPE_LABEL[i.type] ?? "Ação";
    return {
      round: `R${r.position}`, bu: i.buCode || "—", type: i.custom ? `${type} (novo)` : i.decision === "ajustar" ? `${type} (ajustar)` : type,
      headline: summarize(i.headline || i.offerName, 180), detail, owner: i.owner.trim() || "A definir", due: i.due ? brDate(i.due) : "A definir",
    };
  }));
  const available = PAGE.bottom - PAGE.top - 0.45;
  const pages: PlanLine[][] = [];
  let used = Infinity;
  for (const l of lines) {
    const h = planRowHeight(l);
    if (used + h > available) { pages.push([]); used = 0; }
    pages[pages.length - 1].push(l);
    used += h;
  }
  const subtitle = lines.length === 1 ? "1 ação validada nas rodadas" : `${lines.length} ações validadas nas rodadas`;
  return pages.map((rows, i): Slide => ({ kind: "plano", title: part("Plano de ação", i, pages.length), subtitle, rows }));
}

function annexSlides(round: PlanRound, offer: PlanOffer): Slide[] {
  const p = offer.pitch;
  const subtitle = `Rodada ${round.position} · ${round.name} · BU ${offer.buCode}`;
  const keep = (blocks: Block[]) => blocks.filter((b) => b.text);
  const talk = keep([
    { label: "Pitch de abertura", text: tidy(p?.pitch_abertura) },
    { label: "Perguntas para abrir a conversa", text: [p?.pergunta_1, p?.pergunta_2, p?.pergunta_3].map(tidy).filter(Boolean).map((q, i) => `${i + 1}. ${q}`).join("\n") },
  ]);
  const why = keep([
    { label: "Dores do cliente", text: tidy(p?.dores) },
    { label: "Proposta de valor", text: tidy(p?.proposta_valor) },
  ]);
  const groups = [talk, why].filter((g) => g.length);
  if (!groups.length) return [{ kind: "texto", title: offer.name, subtitle, columns: [fitColumn([{ label: "Pitch", text: "Ainda não escrito." }], columnWidth(1))] }];
  const together = groups.map((g) => fitColumn(g, columnWidth(groups.length), 16));
  if (together.every((c) => c.size >= 12)) return [{ kind: "texto", title: offer.name, subtitle, columns: even(together) }];
  // pitch longo: cada metade ganha um slide, com os dois assuntos lado a lado
  return groups.map((g, i): Slide => ({ kind: "texto", title: part(offer.name, i, groups.length), subtitle, columns: even(g.map((b) => fitColumn([b], columnWidth(g.length), 16))) }));
}

export function buildSegmentDeck(plan: SegmentPlan, now = new Date()): Slide[] {
  return [
    { kind: "capa", segment: plan.segmentName, leader: plan.leader, date: longDate(now) },
    ...thesisSlides(plan),
    ...summarySlides(plan),
    ...plan.rounds.flatMap(roundSlides),
    ...planSlides(plan.rounds),
    ...plan.rounds.flatMap((r) => r.foco.flatMap((o) => annexSlides(r, o))),
  ];
}
