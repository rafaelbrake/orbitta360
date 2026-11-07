import { describe, expect, it } from "vitest";
import { cleanCases, employeesLabel, formatCases, MAX_CASES, missingPitchFields, parseCount, sanitizePitch } from "../src/lib/pitch";

describe("ficha de pitch: regras puras", () => {
  it("campos obrigatórios em branco são listados pelo rótulo", () => {
    expect(missingPitchFields({})).toHaveLength(6);
    expect(missingPitchFields({ descricao: "x", dores: "x", proposta_valor: "x", pitch_abertura: "x", perfil_cliente: "x", persona_decisora: "x" })).toEqual([]);
    expect(missingPitchFields({ descricao: "x", dores: "  ", proposta_valor: "x", pitch_abertura: "x", perfil_cliente: "x", persona_decisora: null })).toEqual(["Principais dores", "Persona decisora"]);
  });

  it("cases: descarta vazios, limita tamanho e quantidade, ignora lixo", () => {
    const out = cleanCases([
      { cliente: " A ", desafio: "d", solucao: "s", resultado: "r" },
      { cliente: "", desafio: "", solucao: "", resultado: "" },
      "texto solto", null, 7,
      { cliente: "B", extra: "ignorado" },
    ]);
    expect(out).toEqual([
      { cliente: "A", desafio: "d", solucao: "s", resultado: "r" },
      { cliente: "B", desafio: "", solucao: "", resultado: "" },
    ]);
    expect(cleanCases("não é lista")).toEqual([]);
    expect(cleanCases(Array.from({ length: 50 }, () => ({ cliente: "x" })))).toHaveLength(MAX_CASES);
    expect(cleanCases([{ cliente: "x".repeat(500) }])[0].cliente).toHaveLength(200);
  });

  it("quantidade de funcionários", () => {
    expect(parseCount("2.000")).toBe(2000);
    expect(parseCount("500")).toBe(500);
    expect(parseCount("")).toBeNull();
    expect(parseCount("-3")).toBeNull();
    expect(parseCount("12,5")).toBeNull();
    expect(parseCount("abc")).toBeNull();
    expect(employeesLabel(500, 2000)).toBe("500 a 2.000");
    expect(employeesLabel(1000, 1000)).toBe("1.000");
    expect(employeesLabel(500, null)).toBe("a partir de 500");
    expect(employeesLabel(null, 2000)).toBe("até 2.000");
    expect(employeesLabel(null, null)).toBe("—");
  });

  it("cases viram um texto numerado para a planilha", () => {
    expect(formatCases([
      { cliente: "Hospital X", desafio: "Ransomware", solucao: "SOC", resultado: "Zero paradas" },
      { cliente: "Banco Y", desafio: "", solucao: "", resultado: "" },
    ])).toBe("1) Hospital X — Desafio: Ransomware — Solução: SOC — Resultado: Zero paradas\n2) Banco Y");
    expect(formatCases([])).toBe("");
    expect(formatCases(null)).toBe("");
  });

  it("sanitize: lista fechada de modelo, ticket em formato brasileiro, faixa invertida corrigida", () => {
    const r = sanitizePitch({
      descricao: "  SOC  ", dores: "", cases: [{ cliente: "A" }], modelo_receita: "recorrente", ticket_medio: "R$ 15.000,50",
      funcionarios_min: "2.000", funcionarios_max: "500", perfil_cliente: " Hospitais ",
    });
    expect(r).toMatchObject({ descricao: "SOC", dores: null, modelo_receita: "Recorrente", ticket_medio: 15000.5, funcionarios_min: 500, funcionarios_max: 2000, perfil_cliente: "Hospitais" });
    expect(r.cases).toEqual([{ cliente: "A", desafio: "", solucao: "", resultado: "" }]);
  });

  it("sanitize: lixo vira vazio, nunca quebra", () => {
    const r = sanitizePitch({ modelo_receita: "Mensal?", ticket_medio: "-5", funcionarios_min: "x", cases: 5, descricao: 10 as unknown });
    expect(r.ticket_medio).toBeNull();
    expect(r.funcionarios_min).toBeNull();
    expect(r.cases).toEqual([]);
    expect(r.descricao).toBeNull();
    // texto livre de modelo é enquadrado (mesma regra das ofertas), nunca gravado como veio
    expect(["Recorrente", "Pontual", null]).toContain(r.modelo_receita);
  });
});
