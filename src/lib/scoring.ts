// Regras de cálculo da plataforma. Espelham as funções SQL score_of / class_of
// (supabase/migrations/0001_schema.sql); o teste tests/rls.test.ts confere os dois lados.

export type Weights = readonly [number, number, number, number, number];
export type Notes = readonly [number, number, number, number, number];

export interface Band {
  code: string;
  label: string;
  min_score: number;
  max_score: number;
  direction: string;
  sort: number;
}

/** Score 0–100 = Σ (nota ÷ 5 × peso), com pesos em pontos que somam 100. Arredondado para inteiro. */
export function computeScore(notes: Notes, weights: Weights): number {
  let total = 0;
  for (let i = 0; i < 5; i++) total += (notes[i] / 5) * weights[i];
  return Math.round(total);
}

/** Retorna a faixa que contém o score, ou null se nenhuma faixa o cobrir. */
export function classify(score: number, bands: readonly Band[]): Band | null {
  return (
    [...bands]
      .sort((a, b) => a.sort - b.sort)
      .find((b) => score >= b.min_score && score <= b.max_score) ?? null
  );
}

/** Selo "Venda liderada pelo especialista": critério 4 ≤ 2 e score na faixa Potencial ou acima. */
export function isSpecialistLed(
  notes: Notes,
  score: number,
  potencialMinScore = 70,
): boolean {
  return notes[3] <= 2 && score >= potencialMinScore;
}

export function weightsSum(weights: readonly number[]): number {
  return Math.round(weights.reduce((a, b) => a + b, 0) * 100) / 100;
}

/**
 * Sugestão de nota do critério 2 (receita e margem) a partir do ticket.
 * Nota 3 = ticket médio da BU; cada nota acima ou abaixo = ±step (padrão 20%) do ticket médio.
 * Ex.: ticket = 1,2 × médio → 4; 1,4 × → 5; 0,8 × → 2; 0,6 × ou menos → 1.
 */
export function suggestRevenueNote(
  ticket: number | null | undefined,
  buAverage: number | null | undefined,
  step = 0.2,
): number | null {
  if (!ticket || !buAverage || buAverage <= 0 || step <= 0) return null;
  const note = 3 + Math.round((ticket / buAverage - 1) / step);
  return Math.min(5, Math.max(1, note));
}

export const NOTE_KEYS = ["n1", "n2", "n3", "n4", "n5"] as const;
export const EVIDENCE_KEYS = ["e1", "e2", "e3", "e4", "e5"] as const;

export type EvaluationRow = {
  not_applicable: boolean;
  n1: number | null;
  n2: number | null;
  n3: number | null;
  n4: number | null;
  n5: number | null;
  e1: string | null;
  e2: string | null;
  e3: string | null;
  e4: string | null;
  e5: string | null;
};

export function notesOf(e: EvaluationRow): Notes | null {
  const n = [e.n1, e.n2, e.n3, e.n4, e.n5];
  return n.every((v) => v != null) ? (n as unknown as Notes) : null;
}

/** Célula concluída: "não se aplica" ou 5 notas + evidência para notas 4 e 5. */
export function isEvaluationDone(e: EvaluationRow | undefined | null): boolean {
  if (!e) return false;
  if (e.not_applicable) return true;
  const notes = notesOf(e);
  if (!notes) return false;
  return notes.every((n, i) => n < 4 || (e[EVIDENCE_KEYS[i]] ?? "").trim() !== "");
}
