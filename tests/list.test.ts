import { describe, expect, it } from "vitest";
import { distinct, matchesQuery, norm, paginate, qs } from "../src/lib/list";

describe("busca das listagens", () => {
  it("ignora acento e caixa", () => {
    expect(norm("  Saúde  ")).toBe("saude");
    expect(matchesQuery("saude", "Saúde")).toBe(true);
    expect(matchesQuery("SAÚDE", "Saude")).toBe(true);
  });
  it("todas as palavras precisam aparecer, em qualquer campo", () => {
    expect(matchesQuery("ana sul", "Ana Souza", "ana@x.com", "Sul")).toBe(true);
    expect(matchesQuery("ana norte", "Ana Souza", "ana@x.com", "Sul")).toBe(false);
  });
  it("busca vazia aceita tudo; campos nulos não quebram", () => {
    expect(matchesQuery(undefined, null)).toBe(true);
    expect(matchesQuery("  ", "x")).toBe(true);
    expect(matchesQuery("x", null, undefined)).toBe(false);
  });
});

describe("paginação", () => {
  const items = Array.from({ length: 45 }, (_, i) => i + 1);
  it("fatia a página pedida e informa o intervalo", () => {
    const p = paginate(items, 2, 20);
    expect(p.items[0]).toBe(21);
    expect(p).toMatchObject({ page: 2, pages: 3, total: 45, from: 21, to: 40 });
    expect(paginate(items, 3, 20)).toMatchObject({ from: 41, to: 45 });
  });
  it("página fora do intervalo é ajustada; lista vazia tem 1 página", () => {
    expect(paginate(items, 99, 20).page).toBe(3);
    expect(paginate(items, -5, 20).page).toBe(1);
    expect(paginate([], 1)).toMatchObject({ page: 1, pages: 1, total: 0, from: 0, to: 0 });
  });
});

describe("querystring e distintos", () => {
  it("qs omite vazios", () => {
    expect(qs({ q: "ana", role: "", page: undefined, n: 2 })).toBe("?q=ana&n=2");
    expect(qs({})).toBe("");
  });
  it("distinct limpa, remove duplicados e ordena em pt-BR", () => {
    expect(distinct(["Projeto", " Serviço ", "Projeto", null, "", "Álgebra"])).toEqual(["Álgebra", "Projeto", "Serviço"]);
  });
});
