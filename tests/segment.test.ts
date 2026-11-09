import { describe, expect, it } from "vitest";
import { cleanNote, cleanText, isLevel, levelCounts, planSuggestion, strategyChecklist, suggestedLevel, type Level } from "../src/lib/segment";

const rows = [
  { offerId: "a", classCode: "alta", score: 95 }, { offerId: "b", classCode: "alta", score: 90 }, { offerId: "c", classCode: "alta", score: 88 },
  { offerId: "d", classCode: "potencial", score: 80 }, { offerId: "e", classCode: "secundaria", score: 60 }, { offerId: "f", classCode: "baixa", score: 30 },
];

describe("consolidação do segmento: níveis", () => {
  it("reconhece os três níveis e sugere pela faixa dos heads", () => {
    expect(isLevel("foco") && isLevel("apoio") && isLevel("fora")).toBe(true);
    expect(isLevel("urgente")).toBe(false);
    expect(suggestedLevel("alta")).toBe("foco");
    expect(suggestedLevel("potencial")).toBe("apoio");
    expect(suggestedLevel("secundaria")).toBe("fora");
    expect(suggestedLevel(null)).toBe("fora");
  });

  it("a sugestão respeita o limite de Foco: as melhores notas ficam em Foco e o excedente vira Apoio", () => {
    const p = planSuggestion(rows, new Map(), 2);
    expect([...p.entries()].filter(([, l]) => l === "foco").map(([k]) => k).sort()).toEqual(["a", "b"]);
    expect(p.get("c")).toBe("apoio");
    expect(p.get("d")).toBe("apoio");
    expect(p.get("e")).toBe("fora");
    expect(p.get("f")).toBe("fora");
  });

  it("não mexe no que o líder já definiu e só ocupa as vagas que sobram", () => {
    const current = new Map<string, Level>([["a", "fora"], ["x", "foco"]]);
    const p = planSuggestion(rows, current, 2);
    expect(p.has("a")).toBe(false); // já decidido pelo líder
    expect(p.get("b")).toBe("foco"); // sobra 1 vaga (x ocupa a outra)
    expect(p.get("c")).toBe("apoio");
  });

  it("conta por nível e monta o roteiro de foco claro", () => {
    const c = levelCounts(new Map<string, Level>([["a", "foco"], ["b", "foco"], ["c", "apoio"], ["d", "fora"]]));
    expect(c).toEqual({ foco: 2, apoio: 1, fora: 1 });
    expect(strategyChecklist({ thesis: "Foco em SOC", message: "" }, c, 5).map((i) => i.ok)).toEqual([true, false, true, true]);
    expect(strategyChecklist({ thesis: null, message: null }, { foco: 0, apoio: 0, fora: 0 }, 5).map((i) => i.ok)).toEqual([false, false, false, true]);
    expect(strategyChecklist({ thesis: "x", message: "y" }, { foco: 6, apoio: 0, fora: 0 }, 5)[3].ok).toBe(false);
  });

  it("limpa os textos: vazio vira null e há limite de tamanho", () => {
    expect(cleanNote("  ok ")).toBe("ok");
    expect(cleanNote("   ")).toBeNull();
    expect(cleanNote("x".repeat(500))).toHaveLength(300);
    expect(cleanText(7)).toBeNull();
    expect(cleanText("x".repeat(5000))).toHaveLength(4000);
  });
});
