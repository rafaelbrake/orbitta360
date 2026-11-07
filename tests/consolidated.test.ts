import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

// As funções puras não dependem da sessão; evita carregar cookies/headers do Next no teste.
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../src/lib/session", () => ({ requireProfile: vi.fn() }));

import { buildHeatmap, fetchAll, type RankingRow } from "../src/lib/consolidated";
import { addHeatmapSheets, addMmtSheet, addPitchSheet, addRankingSheet, fileSlug, newWorkbook, sheetName, toXlsxBuffer, withPositions } from "../src/lib/exports";
import type { Bu, Criterion, MmtRow, PitchRow, Segment } from "../src/lib/types";
import bands from "../seed/bands.json";
import criteriaSeed from "../seed/criteria.json";

const bu = (code: string): Bu => ({ id: `bu-${code}`, code, name: `BU ${code}`, active: true, sort: 0 });
const seg = (name: string): Segment => ({ id: `seg-${name}`, name, wave: "2027/I", leader: null, active: true, sort: 0 });
const BUS = [bu("PRT"), bu("CYB")];
const SEGS = [seg("Saúde"), seg("Governo")];
const criteria = criteriaSeed as unknown as Criterion[];

function row(b: Bu, s: Segment, name: string, score: number, classCode: string, extra: Partial<RankingRow> = {}): RankingRow {
  return {
    evaluationId: `${b.code}-${s.name}-${name}`, offerId: name, offerCode: null, offerName: name, bu: b, segment: s,
    score, classCode, specialistLed: false, notes: [5, 4, 3, 5, 3], hasPitch: false, ...extra,
  };
}

const ROWS = [
  row(BUS[1], SEGS[0], "SOC", 91, "alta", { specialistLed: true, hasPitch: true }),
  row(BUS[0], SEGS[0], "Outsourcing", 83, "potencial"),
  row(BUS[0], SEGS[0], "Etiquetas", 60, "secundaria"),
  row(BUS[1], SEGS[1], "Backup", 40, "baixa"),
];

describe("fetchAll", () => {
  it("lê todas as páginas (o PostgREST corta em 1.000 linhas)", async () => {
    const all = Array.from({ length: 2500 }, (_, i) => i);
    const calls: [number, number][] = [];
    const out = await fetchAll<number>(async (from, to) => {
      calls.push([from, to]);
      return { data: all.slice(from, to + 1), error: null };
    });
    expect(out).toHaveLength(2500);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("propaga erro do banco", async () => {
    await expect(fetchAll(async () => ({ data: null, error: { message: "boom" } }))).rejects.toThrow("boom");
  });

  it("termina quando a última página vem cheia e a próxima, vazia", async () => {
    const all = Array.from({ length: 1000 }, (_, i) => i);
    const out = await fetchAll<number>(async (from, to) => ({ data: all.slice(from, to + 1), error: null }));
    expect(out).toHaveLength(1000);
  });
});

describe("heatmap BU × segmento", () => {
  const cells = buildHeatmap(ROWS, BUS, SEGS);
  it("conta ofertas Alta + Potencial e guarda o maior score", () => {
    const prtSaude = cells.get("bu-PRT:seg-Saúde")!;
    expect(prtSaude).toMatchObject({ priorityCount: 1, offers: 2, maxScore: 83, maxClass: "potencial" });
    const cybSaude = cells.get("bu-CYB:seg-Saúde")!;
    expect(cybSaude).toMatchObject({ priorityCount: 1, offers: 1, maxScore: 91, maxClass: "alta" });
  });
  it("célula só com baixa prioridade tem contagem 0 mas mostra o maior score", () => {
    expect(cells.get("bu-CYB:seg-Governo")).toMatchObject({ priorityCount: 0, offers: 1, maxScore: 40, maxClass: "baixa" });
  });
  it("célula sem ofertas fica vazia", () => {
    expect(cells.get("bu-PRT:seg-Governo")).toMatchObject({ priorityCount: 0, offers: 0, maxScore: null, maxClass: null });
  });
});

async function read(wb: ExcelJS.Workbook) {
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(await toXlsxBuffer(wb));
  return out;
}

describe("exportação para Excel", () => {
  it("ranking: cabeçalho com critérios, posição por segmento, rótulo da faixa e selo", async () => {
    const wb = newWorkbook();
    addRankingSheet(wb, ROWS, { criteria, bands });
    const ws = (await read(wb)).getWorksheet("Ranking")!;
    const header = (ws.getRow(1).values as string[]).slice(1);
    expect(header.slice(0, 7)).toEqual(["Posição", "Segmento", "BU", "Oferta", "Score", "Classificação", "Venda liderada pelo especialista"]);
    expect(header).toContain(`1. ${criteria[0].name}`);
    expect(ws.rowCount).toBe(1 + ROWS.length);
    const first = (ws.getRow(2).values as (string | number)[]).slice(1);
    expect(first.slice(0, 7)).toEqual([1, "Saúde", "CYB", "SOC", 91, bands.find((b) => b.code === "alta")!.label, "Sim"]);
    // posição reinicia em cada segmento
    expect(withPositions(ROWS).map((r) => r.position)).toEqual([1, 2, 3, 1]);
    expect(ws.getRow(2).getCell(header.length).value).toBe("Sim"); // pitch
    expect(ws.getRow(3).getCell(header.length).value).toBe("Não");
  });

  it("heatmap: duas abas (contagem e maior score), vazio onde não há oferta", async () => {
    const wb = newWorkbook();
    addHeatmapSheets(wb, ROWS, BUS, SEGS);
    const out = await read(wb);
    const counts = out.getWorksheet("Heatmap - Alta e Potencial")!;
    const max = out.getWorksheet("Heatmap - Maior score")!;
    expect((counts.getRow(2).values as unknown[]).slice(1)).toEqual(["PRT BU PRT", 1, 0]);
    expect((max.getRow(3).values as unknown[]).slice(1, 3)).toEqual(["CYB BU CYB", 91]);
    expect(max.getRow(2).getCell(3).value).toBeNull(); // PRT × Governo sem ofertas
  });

  it("Manter/Mudar/Treinar: uma linha por registro, rótulo do tipo e público", async () => {
    const base = {
      author_id: "u", segment_id: "s", bu_id: "b", offer_id: null, regional: "Sul", priority: "alta" as const,
      reason: null, audience: null, audience_other: null, created_at: "2026-11-02T12:00:00Z", updated_at: "2026-11-03T12:00:00Z",
      segmentName: "Saúde", buCode: "CYB", offerName: "SOC", authorName: "Ana",
    };
    const rows: MmtRow[] = [
      { ...base, id: "1", type: "treinar", headline: "Conversa de valor", evidence: "gap", action: "trilha", indicator: "avanço", audience: "Outro", audience_other: "Pré-vendas", priority: "baixa" },
      { ...base, id: "2", type: "manter", headline: "Diagnóstico", evidence: "12/15", reason: "viu o risco", action: "padrão", indicator: "conversão" },
    ];
    const wb = newWorkbook();
    addMmtSheet(wb, rows);
    const ws = (await read(wb)).getWorksheet("Manter-Mudar-Treinar")!;
    expect(ws.rowCount).toBe(3);
    // manter vem antes de treinar
    expect(ws.getRow(2).getCell(3).value).toBe("Manter");
    expect(ws.getRow(2).getCell(4).value).toBe("Alta");
    expect(ws.getRow(3).getCell(3).value).toBe("Treinar");
    expect(ws.getRow(3).getCell(13).value).toBe("Outro: Pré-vendas");
  });

  it("pitches: uma linha por oferta × segmento, com a oferta, os cases em lista e o perfil de cliente", async () => {
    const long = "linha 1\nlinha 2 " + "x".repeat(500);
    const base = {
      bu_id: "b", segmentName: "Saúde", buCode: "CYB",
      descricao: long, dores: "d", proposta_valor: "v", pitch_abertura: "a", pergunta_1: null, pergunta_2: null, pergunta_3: null,
      cases: [] as { cliente: string; desafio: string; solucao: string; resultado: string }[],
      perfil_cliente: "Hospitais", persona_decisora: "CIO", persona_influenciadora: null,
      funcionarios_min: 500, funcionarios_max: 2000, modelo_receita: "Recorrente" as const, ticket_medio: 15000,
    };
    const cases = [
      { cliente: "Hospital X", desafio: "Ransomware", solucao: "SOC", resultado: "Zero paradas" },
      { cliente: "Rede Y", desafio: "", solucao: "", resultado: "" },
    ];
    const soc = { ...base, offer_id: "o1", segment_id: "s", offerName: "SOC Gerenciado", offerCode: "OF-01", cases } satisfies PitchRow;
    // a MESMA oferta em outro segmento e outra oferta no mesmo segmento são fichas diferentes
    const socGov = { ...base, offer_id: "o1", segment_id: "g", segmentName: "Governo", offerName: "SOC Gerenciado", offerCode: "OF-01", modelo_receita: "Pontual" as const, ticket_medio: 250000 } satisfies PitchRow;
    const edr = { ...base, offer_id: "o2", segment_id: "s", offerName: "EDR", offerCode: "OF-02", funcionarios_min: null, funcionarios_max: null, ticket_medio: null } satisfies PitchRow;
    const wb = newWorkbook();
    addPitchSheet(wb, [socGov, edr, soc]);
    const ws = (await read(wb)).getWorksheet("Pitches")!;
    expect(ws.rowCount).toBe(4);
    const header = (ws.getRow(1).values as string[]).slice(1);
    expect(header.slice(0, 5)).toEqual(["Segmento", "BU", "ID", "Oferta", "Descrição da oferta"]);
    expect(header).toContain("Cases de sucesso");
    expect(header).not.toContain("Sinergias (BUs)");
    expect(header).not.toContain("Aderência");
    // ordenado por segmento, BU e oferta (EDR antes de SOC)
    expect((ws.getRow(2).values as unknown[]).slice(1, 5)).toEqual(["Governo", "CYB", "OF-01", "SOC Gerenciado"]);
    expect((ws.getRow(3).values as unknown[]).slice(1, 5)).toEqual(["Saúde", "CYB", "OF-02", "EDR"]);
    expect((ws.getRow(4).values as unknown[]).slice(1, 5)).toEqual(["Saúde", "CYB", "OF-01", "SOC Gerenciado"]);
    expect(ws.getRow(4).getCell(5).value).toBe(long);
    // cases: todos na mesma célula, numerados
    expect(ws.getRow(4).getCell(12).value).toBe("1) Hospital X — Desafio: Ransomware — Solução: SOC — Resultado: Zero paradas\n2) Rede Y");
    // perfil de cliente em campos separados
    const col = (name: string) => header.indexOf(name) + 1;
    expect(ws.getRow(4).getCell(col("Perfil de cliente / sub-segmento")).value).toBe("Hospitais");
    expect(ws.getRow(4).getCell(col("Persona decisora")).value).toBe("CIO");
    expect(ws.getRow(4).getCell(col("Funcionários")).value).toBe("500 a 2.000");
    expect(ws.getRow(3).getCell(col("Funcionários")).value).toBe("—");
    // ticket segue a lógica mês/deal
    const tk = col("Ticket (mensal se recorrente · deal se pontual)");
    expect(String(ws.getRow(4).getCell(tk).value)).toMatch(/15\.000\/mês$/);
    expect(String(ws.getRow(2).getCell(tk).value)).toMatch(/250\.000\/deal$/);
    expect(ws.getRow(3).getCell(tk).value).toBeNull();
  });

  it("texto que começa com '=' fica como texto (não vira fórmula)", async () => {
    const wb = newWorkbook();
    addRankingSheet(wb, [row(BUS[0], SEGS[0], "=1+1", 70, "potencial")], { criteria, bands });
    const cell = (await read(wb)).getWorksheet("Ranking")!.getRow(2).getCell(4);
    expect(cell.value).toBe("=1+1");
    expect(cell.type).toBe(ExcelJS.ValueType.String);
  });

  it("nomes de aba e de arquivo seguros", () => {
    expect(sheetName("A:B/C?D*E[F]G\\H 123456789012345678901234567890")).toHaveLength(31);
    expect(sheetName("A:B/C")).toBe("A-B-C");
    expect(fileSlug("Varejo (inclui Atacado)")).toBe("varejo-inclui-atacado");
    expect(fileSlug("Saúde")).toBe("saude");
    expect(fileSlug("!!!")).toBe("arquivo");
  });
});
