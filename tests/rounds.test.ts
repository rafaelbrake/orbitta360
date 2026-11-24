import { describe, expect, it } from "vitest";
import {
  buildActionItems, buildRoundSlides, customToItem, cleanHeadline, cleanType, cleanContext, cleanDueDate, cleanLimit, cleanOwner, focoTotals, isDecision, planDraftCopy, roundDone, roundOfBu, roundStats,
  type ActionPlanLite, type MmtRecordLite, type Round,
} from "../src/lib/rounds";
import { indexOfKey } from "../src/lib/meeting";
import type { Level } from "../src/lib/segment";

const rows = (l: [string, number, Level | null][]) => l.map(([offerId, score, level]) => ({ offerId, name: offerId.toUpperCase(), score, level, pitchValidated: false }));

describe("rodadas: telas", () => {
  it("monta abertura, regiões (antes de decidir o Foco), mesa, uma tela por oferta em Foco (maior nota primeiro), plano e fechamento", () => {
    const s = buildRoundSlides(rows([["a", 70, "foco"], ["b", 90, "foco"], ["c", 95, "apoio"], ["d", 10, null]]), { hasContext: false, hasRegional: true });
    expect(s.map((x) => x.key)).toEqual(["abertura", "regioes", "mesa", "oferta:b", "oferta:a", "plano", "resumo"]);
  });
  it("contexto e regiões só aparecem quando há conteúdo; o plano sempre existe (dá para incluir itens novos)", () => {
    expect(buildRoundSlides([], { hasContext: false, hasRegional: false }).map((x) => x.key)).toEqual(["abertura", "mesa", "plano", "resumo"]);
    expect(buildRoundSlides([], { hasContext: true, hasRegional: false }).map((x) => x.key)).toEqual(["abertura", "contexto", "mesa", "plano", "resumo"]);
  });
  it("tirar uma oferta do Foco leva de volta para a mesa", () => {
    const s = buildRoundSlides(rows([["a", 70, "foco"]]), { hasContext: false, hasRegional: false });
    const after = buildRoundSlides(rows([["a", 70, "apoio"]]), { hasContext: false, hasRegional: false });
    expect(indexOfKey(after, "oferta:a")).toBe(after.findIndex((x) => x.key === "mesa"));
    expect(s.length).toBe(after.length + 1);
  });
});

describe("rodadas: andamento", () => {
  it("conta níveis, pitches validados e pontos decididos", () => {
    const st = roundStats(
      [{ level: "foco", pitchValidated: true }, { level: "foco", pitchValidated: false }, { level: "apoio", pitchValidated: true }, { level: "fora", pitchValidated: false }, { level: null, pitchValidated: false }],
      [{ decision: "validado" }, { decision: null }, { decision: "descartado" }],
    );
    expect(st).toEqual({ foco: 2, apoio: 1, fora: 1, semNivel: 1, pitchesValidados: 1, pitchesPendentes: 1, acoesTotal: 3, acoesDecididas: 2, acoesPendentes: 1 });
    expect(roundDone(st)).toBe(false);
  });
  it("a rodada está concluída com Foco decidido, pitches validados e todos os pontos decididos; sem Foco não conclui", () => {
    expect(roundDone(roundStats([{ level: "foco", pitchValidated: true }], [{ decision: "ajustar" }]))).toBe(true);
    expect(roundDone(roundStats([{ level: "apoio", pitchValidated: false }], []))).toBe(false);
  });
  it("soma o Foco do segmento e o teto das rodadas (4 × 5 = 20)", () => {
    const rounds = [1, 2, 3, 4].map((n) => ({ id: `r${n}`, focoLimit: 5 }));
    expect(focoTotals(rounds, new Map([["r1", { foco: 5 }], ["r2", { foco: 3 }]]))).toEqual({ foco: 8, cap: 20 });
  });
});

describe("rodadas: plano de ação", () => {
  const rec = (id: string, bu: string, over: Partial<MmtRecordLite> = {}): MmtRecordLite => ({ id, type: "manter", bu_id: bu, offer_id: null, regional: "Sul", priority: null, headline: id, evidence: null, action: null, indicator: null, audience: null, ...over });
  const plans = new Map<string, ActionPlanLite>([["r2", { record_id: "r2", decision: "validado", owner: "Ana", due_date: "2027-02-01", note: "ok" }], ["r3", { record_id: "r3", decision: "estranha", owner: null, due_date: null, note: null }]]);
  const buCode = new Map([["b1", "LBL"], ["b2", "PRT"], ["b9", "CYB"]]);

  it("pega só os pontos das BUs da rodada, com a decisão tomada e a prioridade primeiro", () => {
    const items = buildActionItems(
      [rec("r1", "b1", { priority: "baixa" }), rec("r2", "b2", { priority: "alta", offer_id: "o1" }), rec("r3", "b1"), rec("fora", "b9")],
      plans, new Set(["b1", "b2"]), buCode, new Map([["o1", "Etiquetas RF"]]),
    );
    expect(items.map((i) => i.recordId)).toEqual(["r2", "r1", "r3"]);
    expect(items[0]).toMatchObject({ decision: "validado", owner: "Ana", due: "2027-02-01", note: "ok", offerName: "Etiquetas RF", buCode: "PRT" });
    expect(items[1].decision).toBeNull();
    expect(items[2].decision).toBeNull(); // decisão fora da lista é ignorada
  });
});

describe("rodadas: itens novos do plano", () => {
  it("o item novo aparece no mesmo formato dos pontos dos regionais, já decidido", () => {
    const i = customToItem({ id: "n1", type: "treinar", bu_id: "b1", headline: "Treinar AMs", action: "Workshop", owner: "Ana", due_date: "2027-03-01", note: null }, new Map([["b1", "LBL"]]));
    expect(i).toMatchObject({ recordId: "n1", custom: true, type: "treinar", buCode: "LBL", headline: "Treinar AMs", decision: "validado", owner: "Ana", due: "2027-03-01", note: "" });
    expect(roundStats([], [i]).acoesDecididas).toBe(1);
  });
  it("sem tipo nem BU também vale", () => {
    expect(customToItem({ id: "n2", type: null, bu_id: null, headline: "Algo", action: null, owner: null, due_date: null, note: null }, new Map())).toMatchObject({ type: "", buCode: "", owner: "" });
  });
  it("título é obrigatório e o tipo só da lista", () => {
    expect(cleanHeadline("  Item  ")).toBe("Item");
    expect(cleanHeadline("   ")).toBeNull();
    expect(cleanHeadline("x".repeat(400))).toHaveLength(300);
    expect(cleanType("mudar")).toBe("mudar");
    expect(cleanType("outro")).toBeNull();
  });
});

describe("rodadas: copiar o rascunho do líder", () => {
  it("copia só o que é da rodada e ainda não tem decisão, respeitando o limite de Foco", () => {
    const draft = new Map<string, Level>([["a", "foco"], ["b", "foco"], ["c", "foco"], ["d", "apoio"], ["x", "foco"], ["e", "fora"]]);
    const current = new Map<string, Level>([["e", "apoio"]]);
    const plan = planDraftCopy(draft, current, new Set(["a", "b", "c", "d", "e"]), 2);
    expect(plan).toEqual([{ offerId: "a", level: "foco" }, { offerId: "b", level: "foco" }, { offerId: "c", level: "apoio" }, { offerId: "d", level: "apoio" }]);
  });
  it("conta o Foco que já existe na rodada", () => {
    const plan = planDraftCopy(new Map<string, Level>([["a", "foco"]]), new Map<string, Level>([["z", "foco"]]), new Set(["a", "z"]), 1);
    expect(plan).toEqual([{ offerId: "a", level: "apoio" }]);
  });
});

describe("rodadas: validação dos campos", () => {
  it("prazo só aceita data real", () => {
    expect(cleanDueDate("2027-02-28")).toBe("2027-02-28");
    for (const v of ["2027-02-30", "28/02/2027", "", null, 5]) expect(cleanDueDate(v)).toBeNull();
  });
  it("limite de Foco: inteiro de 1 a 50", () => {
    expect(cleanLimit("5")).toBe(5);
    for (const v of ["0", "51", "2.5", "", "abc", null]) expect(cleanLimit(v)).toBeNull();
  });
  it("textos são aparados e limitados; decisão só da lista", () => {
    expect(cleanOwner("  Ana  ")).toBe("Ana");
    expect(cleanOwner("   ")).toBeNull();
    expect(cleanOwner("x".repeat(300))).toHaveLength(120);
    expect(cleanContext("y".repeat(9000))).toHaveLength(8000);
    expect(isDecision("validado")).toBe(true);
    expect(isDecision("talvez")).toBe(false);
  });
  it("acha a rodada de uma BU", () => {
    const rounds: Round[] = [{ id: "r1", position: 1, name: "A", context: null, focoLimit: 5, buIds: ["b1"] }, { id: "r2", position: 2, name: "B", context: null, focoLimit: 5, buIds: ["b2"] }];
    expect(roundOfBu(rounds, "b2")?.id).toBe("r2");
    expect(roundOfBu(rounds, "b3")).toBeNull();
  });
});
