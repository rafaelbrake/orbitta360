/**
 * Telas de contexto das rodadas: cada tela é um bloco (cartões, tabela, lista ou texto) com título, fonte e ressalva.
 * O conteúdo fica em JSON no banco; aqui está o formato e a validação, que protegem a tela de um JSON malformado.
 */
export const BLOCK_KINDS = ["cards", "table", "list", "text"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export const KIND_LABEL: Record<BlockKind, string> = { cards: "Cartões", table: "Tabela", list: "Lista", text: "Texto" };
export const isBlockKind = (v: unknown): v is BlockKind => typeof v === "string" && (BLOCK_KINDS as readonly string[]).includes(v);

export type Tone = "ok" | "bad" | "hi";
export type Cell = string | { v: string; t?: Tone };
export interface CardItem { label: string; value: string; caption?: string; tone?: Tone }
export type ListItem = { title?: string; text: string };

export type BlockBody =
  | { cards: CardItem[] }
  | { columns: string[]; rows: Cell[][]; align?: ("l" | "r")[] }
  | { items: ListItem[] }
  | { paragraphs: string[] };

export interface ContextBlock {
  id: string; roundId: string; segmentId: string | null; position: number;
  kind: BlockKind; title: string; subtitle: string | null; body: BlockBody; source: string | null; note: string | null;
}

export const LIMITS = { cards: 12, columns: 14, rows: 60, items: 24, paragraphs: 12, text: 1500, title: 160 } as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number = LIMITS.text): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return typeof v === "string" ? v.trim().slice(0, max) : null;
};
const tone = (v: unknown): Tone | undefined => (v === "ok" || v === "bad" || v === "hi" ? v : undefined);

export type ParseResult = { ok: true; body: BlockBody } | { ok: false; error: string };

/** Confere e limpa o conteúdo de um bloco. Textos são aparados e limitados; o que não é do formato é recusado com o motivo. */
export function parseBody(kind: BlockKind, raw: unknown): ParseResult {
  if (!isObj(raw)) return { ok: false, error: "O conteúdo precisa ser um objeto JSON." };
  if (kind === "cards") {
    if (!Array.isArray(raw.cards) || raw.cards.length === 0) return { ok: false, error: 'Cartões: informe "cards" com ao menos um item.' };
    if (raw.cards.length > LIMITS.cards) return { ok: false, error: `Cartões: no máximo ${LIMITS.cards}.` };
    const cards: CardItem[] = [];
    for (const c of raw.cards) {
      if (!isObj(c)) return { ok: false, error: "Cartões: cada cartão precisa ser um objeto." };
      const label = str(c.label, 200), value = str(c.value, 80);
      if (!label || !value) return { ok: false, error: 'Cartões: cada cartão precisa de "label" e "value".' };
      cards.push({ label, value, ...(str(c.caption, 300) ? { caption: str(c.caption, 300)! } : {}), ...(tone(c.tone) ? { tone: tone(c.tone) } : {}) });
    }
    return { ok: true, body: { cards } };
  }
  if (kind === "table") {
    if (!Array.isArray(raw.columns) || raw.columns.length === 0 || raw.columns.length > LIMITS.columns) return { ok: false, error: `Tabela: "columns" com 1 a ${LIMITS.columns} colunas.` };
    const columns = raw.columns.map((c) => str(c, 120) ?? "");
    if (!Array.isArray(raw.rows) || raw.rows.length === 0) return { ok: false, error: 'Tabela: informe "rows" com ao menos uma linha.' };
    if (raw.rows.length > LIMITS.rows) return { ok: false, error: `Tabela: no máximo ${LIMITS.rows} linhas.` };
    const rows: Cell[][] = [];
    for (const r of raw.rows) {
      if (!Array.isArray(r)) return { ok: false, error: "Tabela: cada linha precisa ser uma lista de células." };
      if (r.length !== columns.length) return { ok: false, error: `Tabela: cada linha precisa ter ${columns.length} células.` };
      rows.push(r.map((c): Cell => {
        if (isObj(c)) return { v: str(c.v) ?? "", ...(tone(c.t) ? { t: tone(c.t) } : {}) };
        return str(c) ?? "";
      }));
    }
    const align = Array.isArray(raw.align) ? raw.align.slice(0, columns.length).map((a) => (a === "r" ? "r" : "l") as "l" | "r") : undefined;
    return { ok: true, body: { columns, rows, ...(align ? { align } : {}) } };
  }
  if (kind === "list") {
    if (!Array.isArray(raw.items) || raw.items.length === 0) return { ok: false, error: 'Lista: informe "items" com ao menos um item.' };
    if (raw.items.length > LIMITS.items) return { ok: false, error: `Lista: no máximo ${LIMITS.items} itens.` };
    const items: ListItem[] = [];
    for (const i of raw.items) {
      if (typeof i === "string" && i.trim()) { items.push({ text: i.trim().slice(0, LIMITS.text) }); continue; }
      if (isObj(i) && str(i.text)) { items.push({ ...(str(i.title, 200) ? { title: str(i.title, 200)! } : {}), text: str(i.text)! }); continue; }
      return { ok: false, error: 'Lista: cada item é um texto ou {"title", "text"}.' };
    }
    return { ok: true, body: { items } };
  }
  if (!Array.isArray(raw.paragraphs) || raw.paragraphs.length === 0) return { ok: false, error: 'Texto: informe "paragraphs" com ao menos um parágrafo.' };
  if (raw.paragraphs.length > LIMITS.paragraphs) return { ok: false, error: `Texto: no máximo ${LIMITS.paragraphs} parágrafos.` };
  const paragraphs = raw.paragraphs.map((p) => str(p)).filter((p): p is string => !!p);
  if (paragraphs.length === 0) return { ok: false, error: "Texto: os parágrafos estão vazios." };
  return { ok: true, body: { paragraphs } };
}

export const cleanTitle = (v: unknown): string | null => (typeof v === "string" ? v.trim().slice(0, LIMITS.title) || null : null);
export const cleanShort = (v: unknown, max = 600): string | null => (typeof v === "string" ? v.trim().slice(0, max) || null : null);

/** Linha do banco → bloco da tela. Linha com conteúdo inválido é descartada (a tela não quebra). */
export interface BlockRow { id: string; round_id: string; segment_id: string | null; position: number | null; kind: string; title: string; subtitle: string | null; body: unknown; source: string | null; note: string | null }
export function toBlock(r: BlockRow): ContextBlock | null {
  if (!isBlockKind(r.kind)) return null;
  const p = parseBody(r.kind, r.body);
  if (!p.ok) return null;
  return { id: r.id, roundId: r.round_id, segmentId: r.segment_id, position: r.position ?? 0, kind: r.kind, title: r.title, subtitle: r.subtitle, body: p.body, source: r.source, note: r.note };
}

/** Ordem de apresentação: posição e, em empate, os gerais antes dos do segmento. */
export function orderBlocks(blocks: ContextBlock[]): ContextBlock[] {
  return [...blocks].sort((a, b) => a.position - b.position || Number(a.segmentId !== null) - Number(b.segmentId !== null) || a.title.localeCompare(b.title, "pt-BR"));
}
