import { parseBRL } from "@/lib/format";
import { normalizeRevenueModel } from "@/lib/offers";

/** Case de sucesso: a ficha aceita um ou mais. */
export interface PitchCase { cliente: string; desafio: string; solucao: string; resultado: string }
export const emptyCase = (): PitchCase => ({ cliente: "", desafio: "", solucao: "", resultado: "" });
export const MAX_CASES = 20;

/** Campos obrigatórios para enviar (mesma regra de `submission_gaps` no banco). */
export const REQUIRED_PITCH = [
  ["descricao", "Descrição da oferta"],
  ["dores", "Principais dores"],
  ["proposta_valor", "Proposta de valor"],
  ["pitch_abertura", "Pitch de abertura"],
  ["perfil_cliente", "Perfil de cliente / sub-segmento"],
  ["persona_decisora", "Persona decisora"],
] as const;

export type PitchRequiredKey = (typeof REQUIRED_PITCH)[number][0];

/** Rótulos dos campos obrigatórios que ainda estão em branco. */
export function missingPitchFields(v: Partial<Record<PitchRequiredKey, string | null | undefined>>): string[] {
  return REQUIRED_PITCH.filter(([k]) => !(v[k] ?? "").trim()).map(([, label]) => label);
}

const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Cases vindos do cliente: só objetos, textos limitados, e cases totalmente em branco são descartados. */
export function cleanCases(raw: unknown): PitchCase[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_CASES)
    .map((c) => {
      const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      return { cliente: txt(o.cliente, 200), desafio: txt(o.desafio, 2000), solucao: txt(o.solucao, 2000), resultado: txt(o.resultado, 2000) };
    })
    .filter((c) => c.cliente || c.desafio || c.solucao || c.resultado);
}

/** Quantidade de funcionários: inteiro ≥ 0; vazio ou inválido vira null. */
export function parseCount(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[.\s]/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && Number.isInteger(n) && n <= 10_000_000 ? n : null;
}

/** "500 a 2.000", "a partir de 500", "até 2.000" ou "—". */
export function employeesLabel(min: number | null | undefined, max: number | null | undefined): string {
  const f = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
  if (min != null && max != null) return min === max ? f(min) : `${f(min)} a ${f(max)}`;
  if (min != null) return `a partir de ${f(min)}`;
  if (max != null) return `até ${f(max)}`;
  return "—";
}

/** Texto único dos cases (uma linha de planilha): "1) Cliente — Desafio: … Solução: … Resultado: …". */
export function formatCases(cases: PitchCase[] | null | undefined): string {
  return (cases ?? [])
    .map((c, i) => `${i + 1}) ${[c.cliente, c.desafio && `Desafio: ${c.desafio}`, c.solucao && `Solução: ${c.solucao}`, c.resultado && `Resultado: ${c.resultado}`].filter(Boolean).join(" — ")}`)
    .join("\n");
}

export interface PitchInput {
  descricao?: unknown; dores?: unknown; proposta_valor?: unknown; pitch_abertura?: unknown;
  pergunta_1?: unknown; pergunta_2?: unknown; pergunta_3?: unknown; cases?: unknown;
  perfil_cliente?: unknown; persona_decisora?: unknown; persona_influenciadora?: unknown;
  funcionarios_min?: unknown; funcionarios_max?: unknown; modelo_receita?: unknown; ticket_medio?: unknown;
}

const orNull = (v: unknown, max: number) => txt(v, max) || null;

/** Valores da ficha prontos para gravar: nunca confia no cliente (limites, listas fechadas e números válidos). */
export function sanitizePitch(v: PitchInput) {
  let min = parseCount(v.funcionarios_min);
  let max = parseCount(v.funcionarios_max);
  if (min != null && max != null && max < min) [min, max] = [max, min]; // troca se vier invertido
  const ticket = parseBRL(typeof v.ticket_medio === "number" ? v.ticket_medio : txt(v.ticket_medio, 30));
  return {
    descricao: orNull(v.descricao, 4000), dores: orNull(v.dores, 4000), proposta_valor: orNull(v.proposta_valor, 4000), pitch_abertura: orNull(v.pitch_abertura, 4000),
    pergunta_1: orNull(v.pergunta_1, 1000), pergunta_2: orNull(v.pergunta_2, 1000), pergunta_3: orNull(v.pergunta_3, 1000),
    cases: cleanCases(v.cases),
    perfil_cliente: orNull(v.perfil_cliente, 300), persona_decisora: orNull(v.persona_decisora, 300), persona_influenciadora: orNull(v.persona_influenciadora, 300),
    funcionarios_min: min, funcionarios_max: max,
    modelo_receita: normalizeRevenueModel(txt(v.modelo_receita, 30)).value,
    ticket_medio: ticket != null && ticket >= 0 ? ticket : null,
  };
}
