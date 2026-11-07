import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../src/lib/session", () => ({ requireProfile: vi.fn() }));

import ExcelJS from "exceljs";
import { deliveryRisk, painWithoutOpening, parseCompareParams } from "../src/lib/compare";
import type { RankingRow } from "../src/lib/consolidated";
import { addAuditSheet, addCompareSheets, newWorkbook, toXlsxBuffer } from "../src/lib/exports";
import { describeRow, diffRow, fieldLabel, fmtValue, summarizeChanges, type AuditCtx } from "../src/lib/audit";
import { parseAuditFilter } from "../src/lib/audit-data";
import bands from "../seed/bands.json";
import criteriaSeed from "../seed/criteria.json";
import type { Criterion } from "../src/lib/types";

const bu = { id: "b1", code: "CYB", name: "Cyber", active: true, sort: 1 };
const seg = { id: "s1", name: "Saúde", wave: "2027/I", leader: null, active: true, sort: 1 };
const r = (name: string, score: number, notes: RankingRow["notes"]): RankingRow => ({
  evaluationId: name, offerId: name, offerCode: null, offerName: name, bu, segment: seg,
  score, classCode: score >= 85 ? "alta" : score >= 70 ? "potencial" : "secundaria", specialistLed: false, notes, hasPitch: false,
});

const ROWS = [
  r("A", 91, [5, 5, 5, 5, 1]), // risco de entrega
  r("B", 75, [3, 3, 3, 3, 2]), // risco de entrega (limite)
  r("C", 60, [5, 3, 3, 2, 1]), // score baixo: fora do risco; dor 5 + abertura 2
  r("D", 88, [5, 5, 5, 1, 5]), // dor 5 + abertura 1
  r("E", 90, [4, 5, 5, 5, 5]), // sem alertas
  r("F", 70, [5, 4, 4, 3, 2]), // risco (score = limite); abertura 3 não conta
];

describe("comparativo entre critérios", () => {
  it("risco de entrega: score alto e prontidão baixa, ordenado por score", () => {
    const out = deliveryRisk(ROWS, { minScore: 70, maxReadiness: 2 });
    expect(out.map((x) => x.offerName)).toEqual(["A", "B", "F"]);
  });

  it("limiares são inclusivos e ajustáveis", () => {
    expect(deliveryRisk(ROWS, { minScore: 71, maxReadiness: 2 }).map((x) => x.offerName)).toEqual(["A", "B"]);
    expect(deliveryRisk(ROWS, { minScore: 70, maxReadiness: 1 }).map((x) => x.offerName)).toEqual(["A"]);
  });

  it("dor máxima com abertura difícil: pior abertura primeiro", () => {
    const out = painWithoutOpening(ROWS, { minPain: 5, maxOpening: 2 });
    expect(out.map((x) => x.offerName)).toEqual(["D", "C"]);
    expect(painWithoutOpening(ROWS, { minPain: 5, maxOpening: 3 }).map((x) => x.offerName)).toEqual(["D", "C", "F"]);
  });

  it("parâmetros inválidos voltam ao padrão e valores são limitados", () => {
    const get = (m: Record<string, string>) => (k: string) => m[k];
    expect(parseCompareParams(get({}), 70)).toEqual({ minScore: 70, maxReadiness: 2, minPain: 5, maxOpening: 2 });
    expect(parseCompareParams(get({ min: "abc", prontidao: "9", dor: "0", abertura: "1.5" }), 70)).toEqual({ minScore: 70, maxReadiness: 5, minPain: 1, maxOpening: 2 });
    expect(parseCompareParams(get({ min: "150" }), 70).minScore).toBe(100);
  });

  it("exportação: duas abas com as ofertas de cada lista", async () => {
    const wb = newWorkbook();
    addCompareSheets(wb, deliveryRisk(ROWS, { minScore: 70, maxReadiness: 2 }), painWithoutOpening(ROWS, { minPain: 5, maxOpening: 2 }),
      { criteria: criteriaSeed as unknown as Criterion[], bands });
    const out = new ExcelJS.Workbook();
    await out.xlsx.load(await toXlsxBuffer(wb));
    expect(out.getWorksheet("Risco de entrega")!.rowCount).toBe(4);
    expect(out.getWorksheet("Dor máxima x abertura baixa")!.rowCount).toBe(3);
  });
});

const ctx: AuditCtx = {
  offers: new Map([["o1", "SOC Gerenciado"]]),
  segments: new Map([["s1", "Saúde"]]),
  bus: new Map([["b1", "CYB"], ["b2", "PRT"]]),
  people: new Map([["u1", "Ana"]]),
  criteria: new Map([[4, "Facilidade de abertura pelo AM"]]),
};

describe("auditoria legível", () => {
  it("diferença campo a campo ignora carimbos automáticos e traduz rótulos", () => {
    const changes = diffRow(
      { n4: 2, e4: null, not_applicable: false, updated_at: "a", updated_by: "x" },
      { n4: 5, e4: "porque sim", not_applicable: false, updated_at: "b", updated_by: "y" },
      ctx,
    );
    expect(changes.map((c) => c.field)).toEqual(["n4", "e4"]);
    expect(summarizeChanges(changes)).toBe("Nota C4 (Facilidade de abertura pelo AM): 2 → 5 · Evidência C4 (Facilidade de abertura pelo AM): — → porque sim");
  });

  it("descreve a que a linha se refere", () => {
    expect(describeRow("evaluations", { offer_id: "o1", segment_id: "s1", bu_id: "b1" }, ctx)).toBe("SOC Gerenciado × Saúde (CYB)");
    expect(describeRow("pitches", { offer_id: "o1", bu_id: "b1", segment_id: "s1" }, ctx)).toBe("SOC Gerenciado × Saúde (CYB)");
    expect(describeRow("bu_submissions", { bu_id: "b2" }, ctx)).toBe("PRT");
    expect(describeRow("mmt_records", { type: "mudar", segment_id: "s1", bu_id: "b1" }, ctx)).toBe("mudar · Saúde · CYB");
    expect(describeRow("mmt_submissions", { user_id: "u1" }, ctx)).toBe("Ana");
    expect(describeRow("settings", { key: "period_open" }, ctx)).toBe("period_open");
    expect(describeRow("evaluations", null, ctx)).toBe("");
  });

  it("carimbos de data viram dd/mm/aaaa hh:mm", () => {
    expect(fmtValue("reopened_at", "2026-11-05T21:01:42.974681+00:00", ctx)).toMatch(/^05\/11\/2026/);
    expect(fmtValue("reopened_at", null, ctx)).toBe("—");
  });

  it("formata valores: booleano, nulo, ids resolvidos e texto longo", () => {
    expect(fmtValue("active", true, ctx)).toBe("Sim");
    expect(fmtValue("x", null, ctx)).toBe("—");
    expect(fmtValue("bu_id", "b2", ctx)).toBe("PRT");
    expect(fmtValue("sinergias_bus", ["b1", "b2"], ctx)).toBe("CYB, PRT");
    expect(fmtValue("icp", "x".repeat(200), ctx)).toHaveLength(78);
    expect(fieldLabel("n3")).toBe("Nota C3");
    expect(fieldLabel("campo_novo")).toBe("campo_novo");
  });

  it("filtros da querystring são validados", () => {
    const get = (m: Record<string, string>) => (k: string) => m[k];
    expect(parseAuditFilter(get({ table: "pitches", action: "UPDATE", user: "00000000-0000-0000-0000-0000000000a1", from: "2026-11-01", to: "2026-11-05" }))).toEqual({
      table: "pitches", action: "UPDATE", userId: "00000000-0000-0000-0000-0000000000a1", from: "2026-11-01", to: "2026-11-05",
    });
    const bad = parseAuditFilter(get({ action: "DROP", user: "' or 1=1 --", from: "01/11/2026", to: "amanhã" }));
    expect(bad).toEqual({ table: undefined, action: undefined, userId: undefined, from: undefined, to: undefined });
  });

  it("exportação da auditoria gera uma linha por evento", async () => {
    const wb = newWorkbook();
    addAuditSheet(wb, [{ at: "2026-11-05T15:00:00Z", who: "Ana", table: "Avaliação (nota)", action: "Alterou", subject: "SOC × Saúde", changes: "Nota C1: 3 → 4" }]);
    const out = new ExcelJS.Workbook();
    await out.xlsx.load(await toXlsxBuffer(wb));
    const ws = out.getWorksheet("Auditoria")!;
    expect(ws.rowCount).toBe(2);
    expect(ws.getRow(2).getCell(6).value).toBe("Nota C1: 3 → 4");
  });
});

import { daysUntil } from "../src/lib/format";

describe("dias até o prazo", () => {
  const now = new Date("2026-11-05T15:00:00Z"); // 12h em Brasília
  it("conta dias corridos no fuso de Brasília", () => {
    expect(daysUntil("2026-11-16", now)).toBe(11);
    expect(daysUntil("2026-11-05", now)).toBe(0);
    expect(daysUntil("2026-11-04", now)).toBe(-1);
  });
  it("não vira o dia antes da meia-noite de Brasília", () => {
    expect(daysUntil("2026-11-06", new Date("2026-11-06T02:30:00Z"))).toBe(1); // ainda 05/11 23h30 em Brasília
  });
  it("datas ausentes ou inválidas devolvem null", () => {
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil("16/11/2026", now)).toBeNull();
  });
});
