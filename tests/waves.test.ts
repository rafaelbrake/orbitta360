import { describe, expect, it } from "vitest";
import { buildWaves, joinNames, orderedSegments, overallDeadline, shortSegmentName, waveDeadlineKey, waveScope } from "../src/lib/waves";
import type { Segment } from "../src/lib/types";

const seg = (name: string, wave: string, sort: number, active = true): Segment => ({ id: name, name, wave, leader: null, active, sort });
const SEGS = [seg("Saúde", "Onda 1", 1), seg("Varejo (inclui Atacado)", "Onda 2", 2), seg("Indústria", "Onda 1", 3), seg("Governo", "Onda 2", 4), seg("Educação", "2027/II", 6, false)];
const SETTINGS = { [waveDeadlineKey("Onda 1")]: "2026-11-12", [waveDeadlineKey("Onda 2")]: "2026-11-19" };

describe("ondas de entrega dos heads", () => {
  it("agrupa os segmentos ativos por onda, na ordem do prazo, e ignora os inativos", () => {
    const w = buildWaves(SEGS, SETTINGS);
    expect(w.map((x) => x.name)).toEqual(["Onda 1", "Onda 2"]);
    expect(w[0].deadline).toBe("2026-11-12");
    expect(w[0].segments.map((s) => s.name)).toEqual(["Saúde", "Indústria"]);
    expect(w[1].segments.map((s) => s.name)).toEqual(["Varejo (inclui Atacado)", "Governo"]);
  });

  it("a ordem vem do prazo, não do nome; onda sem prazo vai por último", () => {
    const w = buildWaves([seg("A", "Zeta", 1), seg("B", "Alfa", 2), seg("C", "Sem prazo", 3)], { [waveDeadlineKey("Zeta")]: "2026-11-10", [waveDeadlineKey("Alfa")]: "2026-11-20" });
    expect(w.map((x) => x.name)).toEqual(["Zeta", "Alfa", "Sem prazo"]);
    expect(w[2].deadline).toBeNull();
  });

  it("ignora prazo em formato inválido", () => {
    expect(buildWaves([seg("A", "X", 1)], { [waveDeadlineKey("X")]: "12/11/2026" })[0].deadline).toBeNull();
  });

  it("o prazo geral é o da última onda; sem prazo nas ondas, vale o antigo", () => {
    expect(overallDeadline(buildWaves(SEGS, SETTINGS), "2026-11-16")).toBe("2026-11-19");
    expect(overallDeadline(buildWaves(SEGS, {}), "2026-11-16")).toBe("2026-11-16");
    expect(overallDeadline([], null)).toBeNull();
  });

  it("segmentos ficam na ordem das ondas (para as colunas da matriz)", () => {
    expect(orderedSegments(buildWaves(SEGS, SETTINGS)).map((s) => s.name)).toEqual(["Saúde", "Indústria", "Varejo (inclui Atacado)", "Governo"]);
  });

  it("textos: lista em português e nome curto do segmento", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Saúde"])).toBe("Saúde");
    expect(joinNames(["Saúde", "Indústria"])).toBe("Saúde e Indústria");
    expect(joinNames(["A", "B", "C"])).toBe("A, B e C");
    expect(shortSegmentName("Varejo (inclui Atacado)")).toBe("Varejo");
    expect(waveScope(buildWaves(SEGS, SETTINGS)[1])).toBe("Varejo e Governo");
  });
});
