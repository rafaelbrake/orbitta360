import { describe, expect, it } from "vitest";
import { buildBook, clip, effectivePitch, hasPitchContent, type PitchData } from "../src/lib/book";
import type { Level } from "../src/lib/segment";

const P = (o: Partial<PitchData> = {}): PitchData => ({
  descricao: null, dores: null, proposta_valor: null, pitch_abertura: null, pergunta_1: null, pergunta_2: null, pergunta_3: null, cases: [],
  perfil_cliente: null, persona_decisora: null, persona_influenciadora: null, funcionarios_min: null, funcionarios_max: null, modelo_receita: null, ticket_medio: null, ...o,
});

describe("book de vendas do segmento", () => {
  it("só conta como pitch quando há texto ou case (ticket e porte sozinhos não bastam)", () => {
    expect(hasPitchContent(null)).toBe(false);
    expect(hasPitchContent(P({ ticket_medio: 1000, modelo_receita: "Pontual", funcionarios_min: 10 }))).toBe(false);
    expect(hasPitchContent(P({ dores: "  " }))).toBe(false);
    expect(hasPitchContent(P({ dores: "Ataques" }))).toBe(true);
    expect(hasPitchContent(P({ cases: [{ cliente: "ACME", desafio: "", solucao: "", resultado: "" }] }))).toBe(true);
  });

  it("vale a versão do líder; sem ela, a do head; sem nenhuma, nada", () => {
    const head = P({ descricao: "do head" }), leader = P({ descricao: "do líder" });
    expect(effectivePitch(head, leader)).toMatchObject({ source: "lider", pitch: { descricao: "do líder" } });
    expect(effectivePitch(head, null)).toMatchObject({ source: "head" });
    expect(effectivePitch(head, P({ ticket_medio: 5 }))).toMatchObject({ source: "head" }); // cópia vazia não apaga o texto do head
    expect(effectivePitch(null, null)).toEqual({ pitch: null, source: null });
  });

  it("separa por nível, ordena pela maior nota, usa a versão certa do pitch e conta o que ficou sem nível", () => {
    const rows = [
      { offerId: "a", code: "OF-01", name: "A", buCode: "CYB", score: 80, classLabel: "Potencial" },
      { offerId: "b", code: "OF-02", name: "B", buCode: "ITS", score: 95, classLabel: "Alta" },
      { offerId: "c", code: null, name: "C", buCode: "DAT", score: 90, classLabel: "Alta" },
      { offerId: "d", code: null, name: "D", buCode: "DAT", score: 50, classLabel: "Baixa" },
      { offerId: "e", code: null, name: "E", buCode: "DAT", score: 40, classLabel: "Baixa" },
    ];
    const levels = new Map<string, Level>([["a", "apoio"], ["b", "foco"], ["c", "foco"], ["d", "fora"]]);
    const b = buildBook({
      rows, levels, notes: new Map([["b", "melhor margem"]]), info: new Map(),
      headPitches: new Map([["b", P({ descricao: "head b" }), ], ["c", P({ descricao: "head c" })]]),
      leaderPitches: new Map([["b", P({ descricao: "líder b" })]]),
    });
    expect(b.foco.map((o) => o.name)).toEqual(["B", "C"]);
    expect(b.apoio.map((o) => o.name)).toEqual(["A"]);
    expect(b.fora.map((o) => o.name)).toEqual(["D"]);
    expect(b.semNivel).toBe(1);
    expect(b.foco[0]).toMatchObject({ note: "melhor margem", pitchSource: "lider" });
    expect(b.foco[1]).toMatchObject({ pitchSource: "head", note: null });
    expect(b.apoio[0].pitch).toBeNull();
  });

  it("resume o texto no fim de uma palavra", () => {
    expect(clip("curto")).toBe("curto");
    expect(clip("  muitos    espaços  ")).toBe("muitos espaços");
    const c = clip("palavra ".repeat(60), 50);
    expect(c.endsWith("…")).toBe(true);
    expect(c.length).toBeLessThanOrEqual(51);
    expect(c).not.toMatch(/palavr…$/);
    expect(clip(null)).toBe("");
  });
});
