import { describe, expect, it } from "vitest";
import { cleanViewText, isViewFilled, VIEW_MAX } from "../src/lib/regional";

describe("visão regional do diretor", () => {
  it("só conta como preenchida quando há texto (espaços não contam)", () => {
    expect(isViewFilled(null)).toBe(false);
    expect(isViewFilled({ works: null, not_works: null })).toBe(false);
    expect(isViewFilled({ works: "   ", not_works: "" })).toBe(false);
    expect(isViewFilled({ works: "Cases locais funcionam", not_works: null })).toBe(true);
    expect(isViewFilled({ works: "", not_works: "Preço trava" })).toBe(true);
  });

  it("limpa o texto: tira espaços das pontas, vazio vira null e respeita o limite", () => {
    expect(cleanViewText("  oi  ")).toBe("oi");
    expect(cleanViewText("   ")).toBeNull();
    expect(cleanViewText(42)).toBeNull();
    expect(cleanViewText("x".repeat(VIEW_MAX + 50))).toHaveLength(VIEW_MAX);
  });
});
