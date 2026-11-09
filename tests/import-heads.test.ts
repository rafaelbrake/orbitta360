import { describe, expect, it } from "vitest";
import { parseBuList, parseCsv, rowsFromTable, validateHeads } from "../src/lib/import-heads";

const BUS = [
  { code: "PRT", name: "Print Solutions" }, { code: "ITD", name: "IT Devices" }, { code: "ITS", name: "IT Solutions" },
  { code: "BCO", name: "Business Consulting" },
];

describe("cadastro de heads em lote", () => {
  it("lê CSV do Excel brasileiro (;), com BOM, aspas e linhas vazias", () => {
    const t = parseCsv('﻿Nome;E-mail;BU\r\nAna Souza;ana@selbetti.com.br;PRT\r\n\r\n"Costa, Bia";bia@selbetti.com.br;"ITD + ITS"\r\n');
    expect(t).toEqual([["Nome", "E-mail", "BU"], ["Ana Souza", "ana@selbetti.com.br", "PRT"], ["Costa, Bia", "bia@selbetti.com.br", "ITD + ITS"]]);
    expect(parseCsv("Nome,Email,BU\nAna,a@b.co,PRT")[1]).toEqual(["Ana", "a@b.co", "PRT"]);
  });

  it("acha as colunas pelo cabeçalho, em qualquer ordem, e reclama quando faltam", () => {
    const ok = rowsFromTable([["BU(s)", "Email", "Nome completo"], ["PRT", "a@b.co", "Ana"]]);
    expect("rows" in ok && ok.rows[0]).toMatchObject({ line: 2, name: "Ana", email: "a@b.co", buRaw: "PRT" });
    expect("error" in rowsFromTable([["Nome", "Telefone"], ["Ana", "1"]])).toBe(true);
    expect("error" in rowsFromTable([["Nome", "E-mail", "BU"]])).toBe(true);
  });

  it("reconhece BUs por sigla ou nome, com vários separadores, sem repetir", () => {
    expect(parseBuList("ITD + ITS", BUS).codes).toEqual(["ITD", "ITS"]);
    expect(parseBuList("itd, its; ITD", BUS).codes).toEqual(["ITD", "ITS"]);
    expect(parseBuList("ITD e ITS", BUS).codes).toEqual(["ITD", "ITS"]);
    expect(parseBuList("  print solutions ", BUS).codes).toEqual(["PRT"]);
    expect(parseBuList("PRT + XYZ", BUS)).toEqual({ codes: ["PRT"], unknown: ["XYZ"] });
    // começo do nome, só quando é único
    expect(parseBuList("Print", BUS).codes).toEqual(["PRT"]);
    expect(parseBuList("business", BUS).codes).toEqual(["BCO"]);
    expect(parseBuList("IT", BUS)).toEqual({ codes: [], unknown: ["IT"] }); // IT Devices e IT Solutions: ambíguo
    expect(parseBuList("Pri", BUS).unknown).toEqual(["Pri"]); // pedaço de palavra não vale
  });

  it("aponta e-mail inválido, nome/BU em branco e BU desconhecida", () => {
    const r = validateHeads([
      { line: 2, name: "Ana", email: "ana@selbetti.com.br", buRaw: "PRT" },
      { line: 3, name: "", email: "sem-arroba", buRaw: "" },
      { line: 4, name: "Caio", email: "caio@selbetti.com.br", buRaw: "ZZZ" },
    ], BUS);
    expect(r[0].issues).toEqual([]);
    expect(r[1].issues).toEqual(expect.arrayContaining(["nome em branco", "BU em branco", expect.stringContaining("e-mail inválido")]));
    expect(r[2].issues).toEqual(["BU desconhecida: ZZZ"]);
  });

  it("junta linhas do mesmo e-mail (maiúsculas não importam) em um head com várias BUs", () => {
    const r = validateHeads([
      { line: 2, name: "Bia", email: "Bia@Selbetti.com.br", buRaw: "ITD" },
      { line: 3, name: "Bia", email: "bia@selbetti.com.br", buRaw: "ITS" },
    ], BUS);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ email: "bia@selbetti.com.br", buCodes: ["ITD", "ITS"], issues: [] });
  });
});
