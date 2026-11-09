import type { PitchCase } from "@/lib/pitch";
import type { Level } from "@/lib/segment";

/** Campos de um pitch (do head ou do líder), como vêm do banco. */
export interface PitchData {
  descricao: string | null; dores: string | null; proposta_valor: string | null; pitch_abertura: string | null;
  pergunta_1: string | null; pergunta_2: string | null; pergunta_3: string | null;
  cases: PitchCase[] | null;
  perfil_cliente: string | null; persona_decisora: string | null; persona_influenciadora: string | null;
  funcionarios_min: number | null; funcionarios_max: number | null;
  modelo_receita: string | null; ticket_medio: number | null;
}

const filled = (v: string | null | undefined) => (v ?? "").trim() !== "";

/** Tem algum texto de verdade (ticket, modelo e porte sozinhos não formam um pitch). */
export function hasPitchContent(p: PitchData | null | undefined): boolean {
  if (!p) return false;
  return [p.descricao, p.dores, p.proposta_valor, p.pitch_abertura, p.pergunta_1, p.pergunta_2, p.pergunta_3, p.perfil_cliente, p.persona_decisora, p.persona_influenciadora].some(filled)
    || (p.cases ?? []).length > 0;
}

/** Qual pitch vale no book: a versão do líder, se tiver conteúdo; senão a do head; senão nenhum. */
export function effectivePitch(head: PitchData | null | undefined, leader: PitchData | null | undefined): { pitch: PitchData | null; source: "lider" | "head" | null } {
  if (hasPitchContent(leader)) return { pitch: leader!, source: "lider" };
  if (hasPitchContent(head)) return { pitch: head!, source: "head" };
  return { pitch: null, source: null };
}

export interface BookInputRow { offerId: string; code: string | null; name: string; buCode: string; score: number; classLabel: string }
export interface OfferInfo { description: string | null; offer_type: string | null; revenue_model: string | null; ticket_medio: number | null }
export interface BookOffer extends BookInputRow {
  level: Level; note: string | null; info: OfferInfo | null; pitch: PitchData | null; pitchSource: "lider" | "head" | null;
}

/** Monta as três seções do book a partir do ranking e das decisões do líder. Cada nível sai pela maior nota. */
export function buildBook(input: {
  rows: BookInputRow[]; levels: ReadonlyMap<string, Level>; notes: ReadonlyMap<string, string>; info: ReadonlyMap<string, OfferInfo>;
  headPitches: ReadonlyMap<string, PitchData>; leaderPitches: ReadonlyMap<string, PitchData>;
}): { foco: BookOffer[]; apoio: BookOffer[]; fora: BookOffer[]; semNivel: number } {
  const out = { foco: [] as BookOffer[], apoio: [] as BookOffer[], fora: [] as BookOffer[], semNivel: 0 };
  for (const r of [...input.rows].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pt-BR"))) {
    const level = input.levels.get(r.offerId);
    if (!level) { out.semNivel++; continue; }
    const { pitch, source } = effectivePitch(input.headPitches.get(r.offerId), input.leaderPitches.get(r.offerId));
    out[level].push({ ...r, level, note: input.notes.get(r.offerId) ?? null, info: input.info.get(r.offerId) ?? null, pitch, pitchSource: source });
  }
  return out;
}

/** Corta um texto longo no fim de uma palavra, com reticências (versão resumida das ofertas de Apoio). */
export function clip(text: string | null | undefined, max = 220): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).trimEnd() + "…";
}
