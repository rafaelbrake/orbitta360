import type { NextRequest } from "next/server";
import { describeRow, diffRow, summarizeChanges, ACTION_LABEL, TABLE_LABEL } from "@/lib/audit";
import { loadAuditCtx, loadAuditForExport, parseAuditFilter } from "@/lib/audit-data";
import { qp } from "@/lib/consolidated";
import { loadConfig } from "@/lib/data";
import { addAuditSheet, newWorkbook, toXlsxBuffer, XLSX_MIME } from "@/lib/exports";
import { requireProfile } from "@/lib/session";

/** Exporta o log de auditoria (com os mesmos filtros da tela) para Excel. Somente admin. */
export async function GET(request: NextRequest) {
  const { supabase } = await requireProfile("admin");
  const sp = request.nextUrl.searchParams;
  const filter = parseAuditFilter((k) => qp(sp.get(k) ?? undefined));
  const config = await loadConfig(supabase);
  const [rows, ctx] = await Promise.all([loadAuditForExport(supabase, filter), loadAuditCtx(supabase, config)]);

  const wb = newWorkbook();
  addAuditSheet(wb, rows.map((r) => ({
    at: r.at,
    who: r.user_id ? (ctx.people.get(r.user_id) ?? "—") : "Sistema",
    table: TABLE_LABEL[r.table_name] ?? r.table_name,
    action: ACTION_LABEL[r.action] ?? r.action,
    subject: describeRow(r.table_name, r.new_row ?? r.old_row, ctx),
    changes: r.action === "UPDATE" ? summarizeChanges(diffRow(r.old_row, r.new_row, ctx)) : r.action === "INSERT" ? "criado" : "removido",
  })));
  return new Response(await toXlsxBuffer(wb), {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="auditoria-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
