import ExcelJS from "exceljs";
import { buildHeatmap, type RankingRow } from "@/lib/consolidated";
import { fmtDateTime } from "@/lib/format";
import { MMT_LABEL, PRIORITY_LABEL, PRIORITY_ORDER } from "@/lib/mmt";
import { fmtTicket } from "@/lib/offers";
import { employeesLabel, formatCases } from "@/lib/pitch";
import type { Band } from "@/lib/scoring";
import type { Bu, Criterion, MmtRow, PitchRow, Segment } from "@/lib/types";

/* ---------- Infra ---------- */
type Cell = string | number | boolean | null;
interface Column { header: string; width: number; wrap?: boolean }

const BRAND = "FF0B3C5D";

export function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Orbitta360 · Selbetti";
  wb.created = new Date();
  return wb;
}

/** Excel limita o nome da aba a 31 caracteres e proíbe : \ / ? * [ ] */
export const sheetName = (s: string) => s.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);

export function addTable(wb: ExcelJS.Workbook, name: string, cols: Column[], rows: Cell[][]) {
  const ws = wb.addWorksheet(sheetName(name));
  ws.columns = cols.map((c) => ({ header: c.header, width: c.width, style: c.wrap ? { alignment: { wrapText: true, vertical: "top" } } : {} }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 30;
  for (const r of rows) ws.addRow(r);
  ws.views = [{ state: "frozen", ySplit: 1 }];
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

export async function toXlsxBuffer(wb: ExcelJS.Workbook) {
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Nome de arquivo seguro para o cabeçalho Content-Disposition. */
export const fileSlug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "arquivo";

/* ---------- Ranking ---------- */
interface RankingCtx { criteria: Criterion[]; bands: (Band & { id?: number })[] }

/** Posição dentro de cada segmento (empates mantêm a ordem; a lista já vem ordenada por score). */
export function withPositions(rows: RankingRow[]) {
  const counter = new Map<string, number>();
  return rows.map((r) => {
    const n = (counter.get(r.segment.id) ?? 0) + 1;
    counter.set(r.segment.id, n);
    return { ...r, position: n };
  });
}

export function addRankingSheet(wb: ExcelJS.Workbook, rows: RankingRow[], ctx: RankingCtx, name = "Ranking") {
  const label = (code: string) => ctx.bands.find((b) => b.code === code)?.label ?? code;
  const cols: Column[] = [
    { header: "Posição", width: 9 }, { header: "Segmento", width: 24 }, { header: "BU", width: 8 },
    { header: "Oferta", width: 38 }, { header: "Score", width: 8 }, { header: "Classificação", width: 22 },
    { header: "Venda liderada pelo especialista", width: 18 },
    ...ctx.criteria.map((c) => ({ header: `${c.id}. ${c.name}`, width: 14 })),
    { header: "Pitch preenchido", width: 12 },
  ];
  return addTable(wb, name, cols, withPositions(rows).map((r) => [
    r.position, r.segment.name, r.bu.code, r.offerName, r.score, label(r.classCode),
    r.specialistLed ? "Sim" : "", ...r.notes, r.hasPitch ? "Sim" : "Não",
  ]));
}

/* ---------- Heatmap ---------- */
export function addHeatmapSheets(wb: ExcelJS.Workbook, rows: RankingRow[], bus: Bu[], segments: Segment[]) {
  const cells = buildHeatmap(rows, bus, segments);
  const header: Column[] = [{ header: "BU", width: 22 }, ...segments.map((s) => ({ header: s.name, width: 16 }))];
  const count = bus.map((b) => [`${b.code} ${b.name}`, ...segments.map((s) => cells.get(`${b.id}:${s.id}`)!.priorityCount)]);
  const max = bus.map((b) => [`${b.code} ${b.name}`, ...segments.map((s) => cells.get(`${b.id}:${s.id}`)!.maxScore)]);
  addTable(wb, "Heatmap - Alta e Potencial", header, count);
  addTable(wb, "Heatmap - Maior score", header, max);
}

/* ---------- Manter / Mudar / Treinar ---------- */
export function addMmtSheet(wb: ExcelJS.Workbook, rows: MmtRow[], name = "Manter-Mudar-Treinar") {
  const cols: Column[] = [
    { header: "Segmento", width: 22 }, { header: "BU", width: 8 }, { header: "Tipo", width: 10 }, { header: "Prioridade", width: 11 },
    { header: "Oferta", width: 26 }, { header: "Regional", width: 14 }, { header: "Diretor", width: 24 },
    { header: "Prática / Problema / Competência", width: 40, wrap: true },
    { header: "Evidência", width: 40, wrap: true },
    { header: "Por que funcionou? / Causa-raiz", width: 36, wrap: true },
    { header: "Manter / Mudar em 2027 / Como desenvolver", width: 40, wrap: true },
    { header: "Indicador", width: 28, wrap: true },
    { header: "Público (treinar)", width: 20 },
    { header: "Atualizado em", width: 17 },
  ];
  const order = { manter: 0, mudar: 1, treinar: 2 } as const;
  const sorted = [...rows].sort(
    (a, b) =>
      a.segmentName.localeCompare(b.segmentName, "pt-BR") || a.buCode.localeCompare(b.buCode) ||
      order[a.type] - order[b.type] || (a.priority ? PRIORITY_ORDER[a.priority] : 3) - (b.priority ? PRIORITY_ORDER[b.priority] : 3),
  );
  return addTable(wb, name, cols, sorted.map((r) => [
    r.segmentName, r.buCode, MMT_LABEL[r.type], r.priority ? PRIORITY_LABEL[r.priority] : "", r.offerName ?? "", r.regional ?? "", r.authorName,
    r.headline, r.evidence, r.reason, r.action, r.indicator,
    r.audience ? (r.audience === "Outro" && r.audience_other ? `Outro: ${r.audience_other}` : r.audience) : "",
    fmtDateTime(r.updated_at),
  ]));
}

/* ---------- Pitches ---------- */
export function addPitchSheet(wb: ExcelJS.Workbook, rows: PitchRow[], name = "Pitches") {
  const w = (header: string, width = 34) => ({ header, width, wrap: true });
  const cols: Column[] = [
    { header: "Segmento", width: 22 }, { header: "BU", width: 8 }, { header: "ID", width: 9 }, w("Oferta", 30),
    w("Descrição da oferta"), w("Principais dores"), w("Proposta de valor"), w("Pitch de abertura para o AM"),
    w("Pergunta de descoberta 1"), w("Pergunta de descoberta 2"), w("Pergunta de descoberta 3"),
    w("Cases de sucesso", 50),
    w("Perfil de cliente / sub-segmento", 28), w("Persona decisora", 24), w("Persona influenciadora", 24),
    { header: "Funcionários", width: 16 }, { header: "Modelo de receita", width: 14 }, { header: "Ticket (mensal se recorrente · deal se pontual)", width: 22 },
  ];
  const sorted = [...rows].sort((a, b) => a.segmentName.localeCompare(b.segmentName, "pt-BR") || a.buCode.localeCompare(b.buCode) || a.offerName.localeCompare(b.offerName, "pt-BR"));
  return addTable(wb, name, cols, sorted.map((p) => [
    p.segmentName, p.buCode, p.offerCode, p.offerName, p.descricao, p.dores, p.proposta_valor, p.pitch_abertura,
    p.pergunta_1, p.pergunta_2, p.pergunta_3, formatCases(p.cases),
    p.perfil_cliente, p.persona_decisora, p.persona_influenciadora, employeesLabel(p.funcionarios_min, p.funcionarios_max),
    p.modelo_receita, p.ticket_medio == null ? null : fmtTicket(p.ticket_medio, p.modelo_receita),
  ]));
}

/* ---------- Comparativo entre critérios ---------- */
export function addCompareSheets(wb: ExcelJS.Workbook, risk: RankingRow[], pain: RankingRow[], ctx: RankingCtx) {
  const label = (code: string) => ctx.bands.find((b) => b.code === code)?.label ?? code;
  const cols: Column[] = [
    { header: "Segmento", width: 24 }, { header: "BU", width: 8 }, { header: "Oferta", width: 38 }, { header: "Score", width: 8 },
    { header: "Classificação", width: 22 }, ...ctx.criteria.map((c) => ({ header: `${c.id}. ${c.name}`, width: 14 })),
  ];
  const line = (r: RankingRow): Cell[] => [r.segment.name, r.bu.code, r.offerName, r.score, label(r.classCode), ...r.notes];
  addTable(wb, "Risco de entrega", cols, risk.map(line));
  addTable(wb, "Dor máxima x abertura baixa", cols, pain.map(line));
}

/* ---------- Auditoria ---------- */
export interface AuditExportRow { at: string; who: string; table: string; action: string; subject: string; changes: string }

export function addAuditSheet(wb: ExcelJS.Workbook, rows: AuditExportRow[]) {
  return addTable(
    wb, "Auditoria",
    [{ header: "Quando", width: 18 }, { header: "Quem", width: 26 }, { header: "O quê", width: 26 }, { header: "Ação", width: 10 },
     { header: "Referente a", width: 36, wrap: true }, { header: "Alterações", width: 80, wrap: true }],
    rows.map((r) => [fmtDateTime(r.at), r.who, r.table, r.action, r.subject, r.changes]),
  );
}
