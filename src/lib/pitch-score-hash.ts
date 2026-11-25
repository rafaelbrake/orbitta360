import { createHash } from "node:crypto";
import type { PitchData } from "@/lib/book";
import { parseScore, pitchFingerprint, type PitchScore } from "@/lib/pitch-score";

/** Impressão do texto avaliado (só no servidor e nos scripts). */
export const pitchHash = (p: Partial<PitchData> | null | undefined): string => createHash("sha256").update(pitchFingerprint(p)).digest("hex");

export interface PitchScoreRow { offer_id: string; content_hash: string; levels: unknown; reasons: unknown; alerts: unknown; improvements: unknown; evaluator: string; evaluated_at: string }

/** Linha do banco → nota na tela, marcada como desatualizada se o pitch em vigor não é mais o avaliado. */
export function toPitchScore(row: PitchScoreRow | undefined, current: PitchData | null): PitchScore | null {
  if (!row || !current) return null;
  const parsed = parseScore(row);
  return parsed ? { ...parsed, evaluator: row.evaluator, evaluatedAt: row.evaluated_at, stale: row.content_hash !== pitchHash(current) } : null;
}
