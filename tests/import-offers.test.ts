import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildPreview, parseBRL, parseOffersWorkbook } from "@/lib/import-offers";

async function template() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("1. Ofertas");
  ws.getRow(5).values = ["ID", "Nome", "Descrição", "Tipo", "Modelo de receita", "Ticket médio (R$/ano)"];
  ws.getRow(6).values = ["EX", "Exemplo (ignorar)", "Linha de exemplo", "Serviço", "Recorrente", 1];
  ws.getRow(7).values = ["OF-01", "SOC Gerenciado", "Monitoramento 24x7", "Serviço", "Recorrente", 480000];
  ws.getRow(8).values = ["OF-02", "Backup", "Backup gerenciado", "Serviço", "Recorrente", "R$ 150.000,50"];
  // linha 9 vazia
  ws.getRow(10).values = ["OF-03", "soc gerenciado", "duplicado no arquivo", "Serviço", "Recorrente", 1];
  ws.getRow(11).values = ["OF-04", "Pentest", null, null, null, null];
  ws.getRow(12).values = ["OF-05", "Já Existe", "x", "x", "x", 10];
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("importação do template de ofertas", () => {
  it("lê a aba 1. Ofertas a partir da linha 7, ignora exemplo (linha 6) e linhas vazias", async () => {
    const { rows, error } = await parseOffersWorkbook(await template());
    expect(error).toBeUndefined();
    expect(rows.map((r) => r.name)).toEqual(["SOC Gerenciado", "Backup", "soc gerenciado", "Pentest", "Já Existe"]);
    expect(rows[0]).toMatchObject({ line: 7, code: "OF-01", ticket_medio: 480000, offer_type: "Serviço" });
    expect(rows[1].ticket_medio).toBe(150000.5);
    expect(rows[3].description).toBeNull();
  });

  it("avisa sobre nomes duplicados (no arquivo e já cadastrados)", async () => {
    const { rows } = await parseOffersWorkbook(await template());
    const preview = buildPreview(rows, ["já existe"]);
    expect(preview.map((p) => p.issue === null)).toEqual([true, true, false, true, false]);
    expect(preview[2].issue).toMatch(/dentro do arquivo/);
    expect(preview[4].issue).toMatch(/já existe/);
  });

  it("erro claro quando falta a aba ou o arquivo é inválido", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Outra");
    const r1 = await parseOffersWorkbook(new Uint8Array(await wb.xlsx.writeBuffer()));
    expect(r1.error).toMatch(/Aba/);
    const r2 = await parseOffersWorkbook(new Uint8Array([1, 2, 3]));
    expect(r2.error).toBeTruthy();
  });

  it("parseBRL", () => {
    expect(parseBRL("R$ 1.200.000,50")).toBe(1200000.5);
    expect(parseBRL("1.200.000")).toBe(1200000);
    expect(parseBRL("120000")).toBe(120000);
    expect(parseBRL("")).toBeNull();
    expect(parseBRL("abc")).toBeNull();
  });
});

describe("tipo e modelo na importação", () => {
  it("valores já padronizados passam sem aviso (qualquer caixa ou acento)", async () => {
    const [r] = buildPreview([{ line: 7, code: null, name: "A", description: null, offer_type: "servico", revenue_model: "RECORRENTE", ticket_medio: null }], []);
    expect(r).toMatchObject({ offer_type: "Serviço", revenue_model: "Recorrente", notes: [] });
  });

  it("texto livre é enquadrado na lista, com aviso do que mudou", async () => {
    const [a, b, c] = buildPreview(
      [
        { line: 7, code: null, name: "A", description: null, offer_type: "Serviço gerenciado", revenue_model: "Assinatura mensal", ticket_medio: null },
        { line: 8, code: null, name: "B", description: null, offer_type: "Licença SaaS", revenue_model: "Projeto", ticket_medio: null },
        { line: 9, code: null, name: "C", description: null, offer_type: "Equipamentos", revenue_model: "Venda", ticket_medio: null },
      ],
      [],
    );
    expect(a).toMatchObject({ offer_type: "Serviço", revenue_model: "Recorrente" });
    expect(a.notes).toHaveLength(2);
    expect(b).toMatchObject({ offer_type: "Software", revenue_model: "Pontual" });
    expect(c).toMatchObject({ offer_type: "Hardware", revenue_model: "Pontual" });
  });

  it("campos em branco continuam em branco, sem aviso", async () => {
    const [r] = buildPreview([{ line: 7, code: null, name: "A", description: null, offer_type: null, revenue_model: "", ticket_medio: null }], []);
    expect(r).toMatchObject({ offer_type: null, revenue_model: null, notes: [] });
  });
});

describe("ID na importação", () => {
  const row = (name: string, code: string | null) => ({ line: 7, code, name, description: null, offer_type: "Serviço", revenue_model: "Recorrente", ticket_medio: null });

  it("ID em branco é aceito (o sistema numera)", () => {
    const [r] = buildPreview([row("A", null)], [], ["OF-01"]);
    expect(r.issue).toBeNull();
  });
  it("ID repetido na BU ou no arquivo é avisado e a linha é ignorada", () => {
    const p = buildPreview([row("A", "OF-01"), row("B", "of-02"), row("C", "OF-02"), row("D", "OF-03")], [], ["OF-01"]);
    expect(p[0].issue).toMatch(/ID duplicado.*OF-01/);
    expect(p[1].issue).toBeNull();
    expect(p[2].issue).toMatch(/dentro do arquivo/);
    expect(p[3].issue).toBeNull();
  });
  it("sem a lista de IDs existentes, só vale o que repete dentro do arquivo", () => {
    const p = buildPreview([row("A", "OF-01"), row("B", "OF-01")], []);
    expect(p[0].issue).toBeNull();
    expect(p[1].issue).toMatch(/dentro do arquivo/);
  });
});
