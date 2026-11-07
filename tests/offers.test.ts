import { describe, expect, it } from "vitest";
import { annualizedTicket, fmtTicket, groupDefaults, isScorable, nextOfferCode, normalizeOfferType, normalizeRevenueModel, planActiveChange, suggestGroupName, ticketHint, ticketLabel, ticketUnit } from "../src/lib/offers";
import type { ActiveChangeRow } from "../src/lib/offers";
import { suggestRevenueNote } from "../src/lib/scoring";

describe("lista padronizada de tipo e modelo", () => {
  it("reconhece os valores exatos, sem aviso", () => {
    expect(normalizeOfferType("Software")).toEqual({ value: "Software", adjusted: false });
    expect(normalizeOfferType("serviço")).toEqual({ value: "Serviço", adjusted: false });
    expect(normalizeRevenueModel("pontual")).toEqual({ value: "Pontual", adjusted: false });
  });
  it("interpreta texto livre pelas mesmas regras da migration", () => {
    expect(normalizeOfferType("Dispositivos e impressoras").value).toBe("Hardware");
    expect(normalizeOfferType("Licenciamento").value).toBe("Software");
    expect(normalizeOfferType("Consultoria").value).toBe("Serviço");
    expect(normalizeRevenueModel("Contrato 36 meses").value).toBe("Recorrente");
    expect(normalizeRevenueModel("Projeto").value).toBe("Pontual");
  });
  it("vazio vira nulo", () => {
    expect(normalizeOfferType("  ")).toEqual({ value: null, adjusted: false });
    expect(normalizeRevenueModel(undefined)).toEqual({ value: null, adjusted: false });
  });
});

describe("agrupamento", () => {
  it("sugere o nome pelo começo em comum", () => {
    expect(suggestGroupName([
      "Oferta de alocação de mão de obra - Dev C#",
      "Oferta de alocação de mão de obra - Dev Java",
      "Oferta de alocação de mão de obra - Arquiteto",
    ])).toBe("Oferta de alocação de mão de obra");
  });
  it("não deixa palavra cortada no meio", () => {
    expect(suggestGroupName(["Suporte N1", "Suporte N2"])).toBe("Suporte");
    expect(suggestGroupName(["Cloud Azure", "Cloud AWS"])).toBe("Cloud");
    expect(suggestGroupName(["Backup completo", "Backups avulsos"])).toBe("");
  });
  it("sem base comum, vazio; com um só nome, ele mesmo", () => {
    expect(suggestGroupName(["Firewall", "Service desk"])).toBe("");
    expect(suggestGroupName(["Único"])).toBe("Único");
    expect(suggestGroupName([])).toBe("");
  });
  it("valores iniciais: tipo e modelo só se forem iguais; ticket é a média", () => {
    expect(groupDefaults([
      { offer_type: "Serviço", revenue_model: "Recorrente", ticket_medio: 100000 },
      { offer_type: "Serviço", revenue_model: "Recorrente", ticket_medio: 200000 },
      { offer_type: "Serviço", revenue_model: "Recorrente", ticket_medio: null },
    ])).toEqual({ offer_type: "Serviço", revenue_model: "Recorrente", ticket_medio: 150000 });
    expect(groupDefaults([
      { offer_type: "Serviço", revenue_model: "Recorrente", ticket_medio: null },
      { offer_type: "Software", revenue_model: "Recorrente", ticket_medio: null },
    ])).toEqual({ offer_type: null, revenue_model: "Recorrente", ticket_medio: null });
  });
  it("só classifica oferta ativa fora de agrupamento", () => {
    expect(isScorable({ active: true, group_id: null })).toBe(true);
    expect(isScorable({ active: true, group_id: "g" })).toBe(false);
    expect(isScorable({ active: false, group_id: null })).toBe(false);
  });
});

describe("ticket: mensal no recorrente, volume do deal no pontual", () => {
  it("rótulo, unidade e ajuda mudam com o modelo", () => {
    expect(ticketLabel("Recorrente")).toMatch(/mensal/i);
    expect(ticketLabel("Pontual")).toMatch(/deal/i);
    expect(ticketLabel(null)).toBe("Ticket médio (R$)");
    expect(ticketUnit("Recorrente")).toBe("/mês");
    expect(ticketUnit("Pontual")).toBe("/deal");
    expect(ticketUnit(undefined)).toBe("");
    expect(ticketHint("Recorrente")).toMatch(/× 12/);
    expect(ticketHint(null)).toMatch(/Escolha o modelo/);
  });

  it("exibe com a unidade certa", () => {
    expect(fmtTicket(15000, "Recorrente")).toMatch(/15\.000\/mês$/);
    expect(fmtTicket(250000, "Pontual")).toMatch(/250\.000\/deal$/);
    expect(fmtTicket(null, "Pontual")).toBe("—");
  });

  it("base anual: recorrente × 12; pontual como está; vazio fica vazio", () => {
    expect(annualizedTicket(15000, "Recorrente")).toBe(180000);
    expect(annualizedTicket(250000, "Pontual")).toBe(250000);
    expect(annualizedTicket(100, null)).toBe(100);
    expect(annualizedTicket(null, "Recorrente")).toBeNull();
    expect(annualizedTicket(Number.NaN, "Pontual")).toBeNull();
  });

  it("a sugestão de nota compara na base anual (mensal de R$ 15 mil = R$ 180 mil/ano)", () => {
    const media = 150000; // ticket médio anual da BU
    // sem anualizar, 15.000 pareceria 10% da média (nota 1); anualizado, é 1,2 × a média (nota 4)
    expect(suggestRevenueNote(15000, media, 0.2)).toBe(1);
    expect(suggestRevenueNote(annualizedTicket(15000, "Recorrente"), media, 0.2)).toBe(4);
    // pontual entra como está
    expect(suggestRevenueNote(annualizedTicket(150000, "Pontual"), media, 0.2)).toBe(3);
  });

  it("agrupamento: ticket médio só quando todos os membros têm o mesmo modelo", () => {
    const rec = { offer_type: "Serviço", revenue_model: "Recorrente", ticket_medio: 10000 };
    const pont = { offer_type: "Serviço", revenue_model: "Pontual", ticket_medio: 200000 };
    expect(groupDefaults([rec, { ...rec, ticket_medio: 20000 }]).ticket_medio).toBe(15000);
    expect(groupDefaults([rec, pont])).toMatchObject({ revenue_model: null, ticket_medio: null }); // não mistura mensal com deal
  });
});

describe("ID automático (mesma regra do banco)", () => {
  it("segue do maior número da BU, com 2 dígitos no mínimo", () => {
    expect(nextOfferCode([])).toBe("OF-01");
    expect(nextOfferCode(["OF-01", "OF-02"])).toBe("OF-03");
    expect(nextOfferCode(["OF-02", "OF-07", "OF-01"])).toBe("OF-08"); // não preenche buracos
    expect(nextOfferCode(["OF-99"])).toBe("OF-100");
  });
  it("ignora o que não segue o padrão, vazios e a outra sequência", () => {
    expect(nextOfferCode([null, undefined, "", "X-9", "OF-ABC", "AG-05", " OF-03 "])).toBe("OF-04");
  });
  it("agrupamento tem sequência própria (AG-NN)", () => {
    expect(nextOfferCode(["OF-05"], true)).toBe("AG-01");
    expect(nextOfferCode(["AG-01", "OF-09", "AG-02"], true)).toBe("AG-03");
  });
});

import { isOfferComplete, missingOfferFields, sanitizeOfferPatch } from "../src/lib/offers";

describe("edição na tabela da etapa 1", () => {
  it("cadastro completo = tipo e modelo (ticket é opcional)", () => {
    expect(isOfferComplete({ offer_type: "Software", revenue_model: "Pontual" })).toBe(true);
    expect(isOfferComplete({ offer_type: "Software", revenue_model: null })).toBe(false);
    expect(missingOfferFields({ offer_type: null, revenue_model: null })).toEqual(["tipo", "modelo de receita"]);
    expect(missingOfferFields({ offer_type: "Serviço", revenue_model: null })).toEqual(["modelo de receita"]);
    expect(missingOfferFields({ offer_type: "Serviço", revenue_model: "Recorrente" })).toEqual([]);
  });

  it("só os campos enviados mudam; vazio limpa", () => {
    expect(sanitizeOfferPatch({ offer_type: "Hardware" })).toEqual({ ok: true, patch: { offer_type: "Hardware" } });
    expect(sanitizeOfferPatch({ revenue_model: "" })).toEqual({ ok: true, patch: { revenue_model: null } });
    expect(sanitizeOfferPatch({ offer_type: "Serviço", revenue_model: "Recorrente", ticket_medio: "15.000" })).toEqual({
      ok: true, patch: { offer_type: "Serviço", revenue_model: "Recorrente", ticket_medio: 15000 },
    });
  });

  it("tipo e modelo só aceitam a lista exata (nada de texto livre)", () => {
    expect(sanitizeOfferPatch({ offer_type: "Projeto" })).toMatchObject({ ok: false });
    expect(sanitizeOfferPatch({ offer_type: "software" })).toMatchObject({ ok: false }); // caixa diferente não passa: a tela só envia valores da lista
    expect(sanitizeOfferPatch({ revenue_model: "Mensal" })).toMatchObject({ ok: false });
  });

  it("ticket: formato brasileiro, não negativo, vazio vira nulo", () => {
    expect(sanitizeOfferPatch({ ticket_medio: "R$ 8.000,50" })).toEqual({ ok: true, patch: { ticket_medio: 8000.5 } });
    expect(sanitizeOfferPatch({ ticket_medio: 90000 })).toEqual({ ok: true, patch: { ticket_medio: 90000 } });
    expect(sanitizeOfferPatch({ ticket_medio: "  " })).toEqual({ ok: true, patch: { ticket_medio: null } });
    expect(sanitizeOfferPatch({ ticket_medio: "abc" })).toMatchObject({ ok: false });
    expect(sanitizeOfferPatch({ ticket_medio: "-5" })).toMatchObject({ ok: false });
  });

  it("sem nenhum campo, não há o que alterar", () => {
    expect(sanitizeOfferPatch({})).toEqual({ ok: false, error: "Nada para alterar." });
  });
});

describe("desconsiderar / reconsiderar ofertas na etapa 1", () => {
  const row = (id: string, o: Partial<ActiveChangeRow> = {}): ActiveChangeRow => ({ id, active: true, is_group: false, group_id: null, offer_type: null, revenue_model: null, ...o });

  it("desconsidera as ativas e ignora as que já estão desconsideradas", () => {
    const p = planActiveChange([row("a"), row("b", { active: false }), row("c")], false, false);
    expect(p.ids).toEqual(["a", "c"]);
    expect(p.skipped).toEqual([]);
  });

  it("não mexe em agrupamento nem em oferta que já está dentro de um agrupamento", () => {
    const p = planActiveChange([row("g", { is_group: true }), row("m", { group_id: "g" }), row("x")], false, true);
    expect(p.ids).toEqual(["x"]);
    expect(p.skipped).toEqual([{ id: "g", reason: "grupo" }, { id: "m", reason: "membro" }]);
  });

  it("reconsiderar: antes de confirmar a etapa 1 volta qualquer uma; depois, só as completas", () => {
    const rows = [row("a", { active: false }), row("b", { active: false, offer_type: "Software", revenue_model: "Pontual" })];
    expect(planActiveChange(rows, true, false).ids).toEqual(["a", "b"]);
    const depois = planActiveChange(rows, true, true);
    expect(depois.ids).toEqual(["b"]);
    expect(depois.skipped).toEqual([{ id: "a", reason: "incompleta" }]);
  });

  it("desconsiderar nunca é barrado pela confirmação da etapa 1", () => {
    expect(planActiveChange([row("a")], false, true).ids).toEqual(["a"]);
  });
});
