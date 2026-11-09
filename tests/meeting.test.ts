import { describe, expect, it } from "vitest";
import { buildSlides, clampIndex, indexOfKey, keyToMove, pendingAdjustments, slideCounter, type DeckRowLite } from "../src/lib/meeting";

const row = (offerId: string, score: number, level: DeckRowLite["level"], extra: Partial<DeckRowLite> = {}): DeckRowLite => ({ offerId, name: offerId.toUpperCase(), score, level, reviewNote: null, reviewDone: false, ...extra });

describe("modo reunião: telas e navegação", () => {
  it("monta a sequência: base, uma tela por oferta em Foco (maior nota primeiro), apoio e regiões só se houver, fechamento", () => {
    const rows = [row("a", 80, "foco"), row("b", 95, "foco"), row("c", 70, "apoio"), row("d", 40, "fora"), row("e", 30, null)];
    expect(buildSlides(rows, { hasRegional: true }).map((s) => s.key)).toEqual(["abertura", "estrategia", "mesa", "oferta:b", "oferta:a", "apoio", "regioes", "resumo"]);
    expect(buildSlides([row("d", 40, "fora")], { hasRegional: false }).map((s) => s.key)).toEqual(["abertura", "estrategia", "mesa", "resumo"]);
  });

  it("mudar o nível muda as telas; se a tela atual some, volta para a mesa de decisão", () => {
    const antes = buildSlides([row("a", 80, "foco"), row("b", 70, "foco")], { hasRegional: false });
    const depois = buildSlides([row("a", 80, "apoio"), row("b", 70, "foco")], { hasRegional: false });
    expect(antes.some((s) => s.key === "oferta:a")).toBe(true);
    expect(depois.some((s) => s.key === "oferta:a")).toBe(false);
    expect(indexOfKey(depois, "oferta:b")).toBe(depois.findIndex((s) => s.key === "oferta:b")); // a mesma tela
    expect(depois[indexOfKey(depois, "oferta:a")].key).toBe("mesa"); // a que saiu → mesa
    expect(indexOfKey([], "x")).toBe(0);
  });

  it("limita o índice e traduz as teclas", () => {
    expect(clampIndex(-3, 5)).toBe(0);
    expect(clampIndex(9, 5)).toBe(4);
    expect(clampIndex(0, 0)).toBe(0);
    expect(keyToMove("ArrowRight")).toEqual({ by: 1 });
    expect(keyToMove("ArrowLeft")).toEqual({ by: -1 });
    expect(keyToMove(" ")).toEqual({ by: 1 });
    expect(keyToMove(" ", true)).toEqual({ by: -1 });
    expect(keyToMove("Home")).toEqual({ to: "start" });
    expect(keyToMove("End")).toEqual({ to: "end" });
    expect(keyToMove("a")).toBeNull();
    expect(slideCounter(0, 8)).toBe("1 de 8");
  });

  it("lista só os ajustes pedidos que ainda não foram feitos, da maior nota para a menor", () => {
    const rows = [
      row("a", 70, "foco", { reviewNote: "trocar o case" }),
      row("b", 90, "apoio", { reviewNote: "mais curto" }),
      row("c", 95, "foco", { reviewNote: "já feito", reviewDone: true }),
      row("d", 50, "foco", { reviewNote: "   " }),
      row("e", 40, "fora"),
    ];
    expect(pendingAdjustments(rows).map((r) => r.offerId)).toEqual(["b", "a"]);
  });
});
