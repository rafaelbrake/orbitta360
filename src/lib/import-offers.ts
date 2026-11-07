import ExcelJS from "exceljs";
import { parseBRL } from "@/lib/format";
import { normalizeOfferType, normalizeRevenueModel } from "@/lib/offers";

/** Layout do template dos heads: aba "1. Ofertas", cabeçalho na linha 5, linha 6 = exemplo, dados a partir da 7. */
export const IMPORT_SHEET = "1. Ofertas";
export const IMPORT_FIRST_DATA_ROW = 7;

export interface ParsedOffer {
  line: number;
  code: string | null;
  name: string;
  description: string | null;
  offer_type: string | null;
  revenue_model: string | null;
  ticket_medio: number | null;
}

export interface ImportPreviewRow extends ParsedOffer {
  issue: string | null; // se preenchido, a linha será ignorada
  notes: string[]; // avisos que não impedem a importação (ex.: tipo ajustado para a lista padrão)
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text).trim();
    if (v instanceof Date) return v.toISOString();
    return "";
  }
  return String(v).trim();
}

export { parseBRL };

export async function parseOffersWorkbook(data: ArrayBuffer | Uint8Array): Promise<{ rows: ParsedOffer[]; error?: string }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as ArrayBuffer);
  } catch {
    return { rows: [], error: "Não foi possível ler o arquivo. Envie o template .xlsx preenchido." };
  }
  const ws = wb.getWorksheet(IMPORT_SHEET);
  if (!ws) return { rows: [], error: `Aba "${IMPORT_SHEET}" não encontrada no arquivo.` };

  const rows: ParsedOffer[] = [];
  for (let r = IMPORT_FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = cellText(row.getCell(2).value);
    if (!name) continue; // linha vazia
    const tRaw = row.getCell(6).value;
    const ticketText = typeof tRaw === "number" ? tRaw : cellText(tRaw);
    rows.push({
      line: r,
      code: cellText(row.getCell(1).value) || null,
      name,
      description: cellText(row.getCell(3).value) || null,
      offer_type: cellText(row.getCell(4).value) || null,
      revenue_model: cellText(row.getCell(5).value) || null,
      ticket_medio: parseBRL(ticketText),
    });
  }
  return { rows };
}

/**
 * Prepara a prévia: marca duplicados (no arquivo e contra as ofertas já cadastradas, sem diferenciar maiúsculas)
 * e enquadra tipo e modelo de receita nas listas padronizadas, avisando o que foi ajustado.
 */
export function buildPreview(rows: ParsedOffer[], existingNames: string[], existingCodes: string[] = []): ImportPreviewRow[] {
  const existing = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const existingIds = new Set(existingCodes.map((c) => c.trim().toLowerCase()).filter(Boolean));
  const seen = new Set<string>();
  const seenIds = new Set<string>();
  return rows.map((r) => {
    const key = r.name.trim().toLowerCase();
    let issue: string | null = null;
    if (existing.has(key)) issue = "Nome duplicado: já existe oferta com esse nome nesta BU";
    else if (seen.has(key)) issue = "Nome duplicado dentro do arquivo";
    // ID é opcional: em branco, o sistema numera (OF-NN). Se vier preenchido, não pode repetir na BU.
    const idKey = (r.code ?? "").trim().toLowerCase();
    if (!issue && idKey) {
      if (existingIds.has(idKey)) issue = `ID duplicado: já existe a oferta ${r.code} nesta BU`;
      else if (seenIds.has(idKey)) issue = "ID duplicado dentro do arquivo";
    }
    seen.add(key);
    if (idKey) seenIds.add(idKey);

    const notes: string[] = [];
    const type = normalizeOfferType(r.offer_type);
    const model = normalizeRevenueModel(r.revenue_model);
    if (type.adjusted) notes.push(`Tipo “${r.offer_type}” ajustado para ${type.value}`);
    if (model.adjusted) notes.push(`Modelo “${r.revenue_model}” ajustado para ${model.value}`);
    return { ...r, offer_type: type.value, revenue_model: model.value, issue, notes };
  });
}
