import { describe, expect, it } from "vitest";
import bands from "../seed/bands.json";
import criteria from "../seed/criteria.json";
import {
  classify,
  computeScore,
  isEvaluationDone,
  isSpecialistLed,
  suggestRevenueNote,
  weightsSum,
  type Weights,
} from "@/lib/scoring";

const weights = criteria.map((c) => c.weight) as unknown as Weights;

describe("computeScore", () => {
  it("pesos iniciais somam 100", () => {
    expect(weightsSum(weights)).toBe(100);
  });

  it("notas 5, 4, 3, 5, 3 → 30 + 20 + 12 + 15 + 6 = 83", () => {
    expect(computeScore([5, 4, 3, 5, 3], weights)).toBe(83);
  });

  it("extremos: tudo 5 = 100 e tudo 1 = 20", () => {
    expect(computeScore([5, 5, 5, 5, 5], weights)).toBe(100);
    expect(computeScore([1, 1, 1, 1, 1], weights)).toBe(20);
  });

  it("recalcula quando os pesos mudam", () => {
    expect(computeScore([5, 4, 3, 5, 3], [20, 20, 20, 20, 20])).toBe(80);
  });
});

describe("classify", () => {
  const cases: [number, string][] = [
    [100, "alta"], [85, "alta"], [84, "potencial"], [83, "potencial"], [70, "potencial"],
    [69, "secundaria"], [55, "secundaria"], [54, "baixa"], [20, "baixa"],
  ];
  it.each(cases)("score %i → %s", (score, code) => {
    expect(classify(score, bands)?.code).toBe(code);
  });

  it("83 é Prioridade potencial", () => {
    expect(classify(83, bands)?.label).toBe("Prioridade potencial");
  });

  it("respeita faixas editadas", () => {
    const custom = bands.map((b) =>
      b.code === "alta" ? { ...b, min_score: 80 } : b.code === "potencial" ? { ...b, max_score: 79 } : b,
    );
    expect(classify(83, custom)?.code).toBe("alta");
    expect(classify(79, custom)?.code).toBe("potencial");
  });
});

describe("selo de especialista", () => {
  it("critério 4 ≤ 2 e score ≥ 70", () => {
    expect(isSpecialistLed([5, 5, 5, 2, 5], 90)).toBe(true);
    expect(isSpecialistLed([5, 5, 5, 3, 5], 90)).toBe(false);
    expect(isSpecialistLed([3, 3, 3, 1, 3], 60)).toBe(false);
  });
});

describe("suggestRevenueNote", () => {
  it("nota 3 = ticket médio da BU; ±20% por nota", () => {
    expect(suggestRevenueNote(100, 100)).toBe(3);
    expect(suggestRevenueNote(120, 100)).toBe(4);
    expect(suggestRevenueNote(140, 100)).toBe(5);
    expect(suggestRevenueNote(300, 100)).toBe(5);
    expect(suggestRevenueNote(80, 100)).toBe(2);
    expect(suggestRevenueNote(60, 100)).toBe(1);
    expect(suggestRevenueNote(10, 100)).toBe(1);
  });
  it("passo configurável", () => {
    expect(suggestRevenueNote(110, 100, 0.1)).toBe(4);
  });
  it("sem dados, sem sugestão", () => {
    expect(suggestRevenueNote(null, 100)).toBeNull();
    expect(suggestRevenueNote(100, 0)).toBeNull();
  });
});

describe("isEvaluationDone", () => {
  const base = { not_applicable: false, n1: 3, n2: 3, n3: 3, n4: 3, n5: 3, e1: null, e2: null, e3: null, e4: null, e5: null };
  it("completa sem evidência quando todas as notas ≤ 3", () => {
    expect(isEvaluationDone(base)).toBe(true);
  });
  it("exige evidência para nota 4 ou 5", () => {
    expect(isEvaluationDone({ ...base, n1: 5 })).toBe(false);
    expect(isEvaluationDone({ ...base, n1: 5, e1: "Case X" })).toBe(true);
  });
  it("não se aplica conta como concluída; vazia não", () => {
    expect(isEvaluationDone({ ...base, not_applicable: true, n1: null })).toBe(true);
    expect(isEvaluationDone({ ...base, n1: null })).toBe(false);
    expect(isEvaluationDone(undefined)).toBe(false);
  });
});
