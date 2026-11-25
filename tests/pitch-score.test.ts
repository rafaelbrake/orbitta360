import { describe, expect, it } from "vitest";
import { CRITERIA, parseScore, pitchFingerprint, pointsOf, scoreBand, scoreTotal, type CriterionKey, type Level03 } from "../src/lib/pitch-score";
import { pitchHash, toPitchScore, type PitchScoreRow } from "../src/lib/pitch-score-hash";
import type { PitchData } from "../src/lib/book";

const all = (n: Level03) => Object.fromEntries(CRITERIA.map((c) => [c.key, n])) as Record<CriterionKey, Level03>;
const pitch = {
  descricao: "Etiquetas", dores: "Ruptura de gôndola", proposta_valor: "Preço certo", pitch_abertura: "Quanto custa?", pergunta_1: "Quem precifica?", pergunta_2: null, pergunta_3: null,
  cases: [{ cliente: "Rede Alfa", desafio: "d", solucao: "s", resultado: "Zero rupturas" }], perfil_cliente: null, persona_decisora: null, persona_influenciadora: null,
  funcionarios_min: null, funcionarios_max: null, modelo_receita: null, ticket_medio: null,
} as PitchData;

describe("régua da nota do pitch", () => {
  it("os pesos somam 100 e os extremos dão 0 e 100", () => {
    expect(CRITERIA.reduce((s, c) => s + c.max, 0)).toBe(100);
    expect(scoreTotal(all(0))).toBe(0);
    expect(scoreTotal(all(3))).toBe(100);
    for (const c of CRITERIA) expect(pointsOf(c.key, 3)).toBe(c.max);
  });
  it("bate com a calibração aprovada", () => {
    expect(scoreTotal({ dor: 1, proposta: 1, prova: 0, abertura: 0, perguntas: 1, clareza: 1 })).toBe(22);
    expect(scoreTotal({ dor: 3, proposta: 3, prova: 3, abertura: 2, perguntas: 2, clareza: 1 })).toBe(83);
  });
  it("faixas: alerta impede o pronto, mas não muda o refazer", () => {
    expect(scoreBand(80, [])).toBe("pronto");
    expect(scoreBand(95, [{}])).toBe("ajustar");
    expect(scoreBand(79, [])).toBe("ajustar");
    expect(scoreBand(60, [])).toBe("ajustar");
    expect(scoreBand(59, [{}])).toBe("refazer");
  });
  it("sem os seis níveis válidos não há nota; alertas e melhorias inválidos são descartados", () => {
    expect(parseScore({ levels: { ...all(2), prova: 4 } })).toBeNull();
    expect(parseScore({ levels: { dor: 1 } })).toBeNull();
    const p = parseScore({ levels: all(2), reasons: { dor: " ok ", outro: "x" }, alerts: [{ tipo: "autorizacao", texto: "x" }, { tipo: "numero", texto: "sem fonte" }], improvements: ["a", "", 3] });
    expect(p?.reasons).toEqual({ dor: "ok" });
    expect(p?.alerts).toEqual([{ tipo: "numero", texto: "sem fonte" }]);
    expect(p?.improvements).toEqual(["a"]);
  });
});

describe("nota desatualizada quando o pitch muda", () => {
  const row: PitchScoreRow = { offer_id: "a", content_hash: pitchHash(pitch), levels: all(2), reasons: {}, alerts: [], improvements: [], evaluator: "Claude", evaluated_at: "2026-11-24T12:00:00Z" };
  it("espaços, quebras de linha, ticket e cases vazios não contam como mudança", () => {
    const same = { ...pitch, dores: "  Ruptura   de\r\ngôndola ", ticket_medio: 500, cases: [...(pitch.cases ?? []), { cliente: "", desafio: "", solucao: "", resultado: "" }] };
    expect(pitchFingerprint(same)).toBe(pitchFingerprint(pitch));
    expect(toPitchScore(row, same)?.stale).toBe(false);
  });
  it("mudar o texto ou o resultado de um case marca como desatualizada", () => {
    expect(toPitchScore(row, { ...pitch, proposta_valor: "Outra promessa" })?.stale).toBe(true);
    expect(toPitchScore(row, { ...pitch, cases: [{ ...pitch.cases![0], resultado: "30% menos" }] })?.stale).toBe(true);
  });
  it("sem linha ou sem pitch, não há nota", () => {
    expect(toPitchScore(undefined, pitch)).toBeNull();
    expect(toPitchScore(row, null)).toBeNull();
  });
});
