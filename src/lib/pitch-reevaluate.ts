import type { PitchData } from "@/lib/book";
import { EvaluationError, type Evaluation, type EvaluationInput } from "@/lib/pitch-evaluator";
import { scoreTotal, type PitchScore } from "@/lib/pitch-score";
import { pitchHash, toPitchScore, type PitchScoreRow } from "@/lib/pitch-score-hash";

/** O que a rota precisa fazer fora daqui: ler o pitch em vigor, a nota atual, avaliar e gravar. */
export interface ReevaluateDeps {
  loadPitch: () => Promise<{ segmento: string; oferta: string; bu: string; pitch: PitchData } | null>;
  loadScore: () => Promise<PitchScoreRow | undefined>;
  evaluate: (input: EvaluationInput) => Promise<Evaluation>;
  save: (row: PitchScoreRow) => Promise<void>;
  now?: () => Date;
}

export type ReevaluateResult =
  | { ok: true; score: PitchScore; previousTotal: number | null; unchanged: boolean }
  | { ok: false; status: number; error: string };

/**
 * Reavalia o pitch salvo. Texto igual ao já avaliado não é avaliado de novo (devolve a nota que existe),
 * para ninguém clicar até sair um número melhor.
 */
export async function reevaluate(deps: ReevaluateDeps): Promise<ReevaluateResult> {
  const current = await deps.loadPitch();
  if (!current) return { ok: false, status: 400, error: "Esta oferta ainda não tem pitch escrito." };
  const before = toPitchScore(await deps.loadScore(), current.pitch);
  const previousTotal = before ? scoreTotal(before.levels) : null;
  if (before && !before.stale) return { ok: true, score: before, previousTotal, unchanged: true };
  let result: Evaluation;
  try {
    result = await deps.evaluate(current);
  } catch (error) {
    if (error instanceof EvaluationError) return { ok: false, status: 502, error: error.message };
    throw error;
  }
  const row: PitchScoreRow = {
    offer_id: "", content_hash: pitchHash(current.pitch), levels: result.levels, reasons: result.reasons, alerts: result.alerts, improvements: result.improvements,
    evaluator: result.model, evaluated_at: (deps.now?.() ?? new Date()).toISOString(),
  };
  await deps.save(row);
  return { ok: true, score: toPitchScore(row, current.pitch)!, previousTotal, unchanged: false };
}
