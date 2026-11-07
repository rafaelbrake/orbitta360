import type { RankingRow } from "@/lib/consolidated";

/** Limiares do comparativo entre critérios (ajustáveis na tela). */
export interface CompareParams {
  /** Score mínimo para considerar "score alto" (padrão: início da faixa Potencial). */
  minScore: number;
  /** Nota máxima em Cases e prontidão (critério 5) para contar como "baixa". */
  maxReadiness: number;
  /** Nota mínima da dor (critério 1) para contar como "dor máxima". */
  minPain: number;
  /** Nota máxima da facilidade de abertura (critério 4) para contar como "baixa". */
  maxOpening: number;
}

export const DEFAULT_COMPARE = { maxReadiness: 2, minPain: 5, maxOpening: 2 } as const;

/** Score alto, mas Cases e prontidão baixos: risco de não conseguir entregar o que a campanha promete. */
export function deliveryRisk(rows: RankingRow[], p: Pick<CompareParams, "minScore" | "maxReadiness">): RankingRow[] {
  return rows
    .filter((r) => r.score >= p.minScore && r.notes[4] <= p.maxReadiness)
    .sort((a, b) => b.score - a.score || a.notes[4] - b.notes[4] || a.offerName.localeCompare(b.offerName, "pt-BR"));
}

/** Dor máxima no segmento, mas o AM tem dificuldade de abrir a conversa: falta pitch/treinamento. */
export function painWithoutOpening(rows: RankingRow[], p: Pick<CompareParams, "minPain" | "maxOpening">): RankingRow[] {
  return rows
    .filter((r) => r.notes[0] >= p.minPain && r.notes[3] <= p.maxOpening)
    .sort((a, b) => a.notes[3] - b.notes[3] || b.score - a.score || a.offerName.localeCompare(b.offerName, "pt-BR"));
}

const int = (v: string | undefined, def: number, min: number, max: number) => {
  const n = Number(v);
  return v != null && v !== "" && Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : def;
};

export function parseCompareParams(get: (k: string) => string | undefined, defaultMinScore: number): CompareParams {
  return {
    minScore: int(get("min"), defaultMinScore, 0, 100),
    maxReadiness: int(get("prontidao"), DEFAULT_COMPARE.maxReadiness, 1, 5),
    minPain: int(get("dor"), DEFAULT_COMPARE.minPain, 1, 5),
    maxOpening: int(get("abertura"), DEFAULT_COMPARE.maxOpening, 1, 5),
  };
}
