import type { NextRequest } from "next/server";
import { loadMmtRows, loadPitchRows, loadRanking, qp, requireConsolidated } from "@/lib/consolidated";
import { parseCompareParams, deliveryRisk, painWithoutOpening } from "@/lib/compare";
import { loadConfig } from "@/lib/data";
import { addCompareSheets, addHeatmapSheets, addMmtSheet, addPitchSheet, addRankingSheet, fileSlug, newWorkbook, toXlsxBuffer, XLSX_MIME } from "@/lib/exports";
import { DIRECTORS_ENABLED } from "@/lib/features";
import { MMT_TYPES } from "@/lib/mmt";

const VIEWS = ["ranking", "heatmap", "comparativo", "mmt", "pacote"] as const;
type View = (typeof VIEWS)[number];

/** Exportação para Excel de cada visão consolidada e do "pacote do segmento". */
export async function GET(request: NextRequest, ctx: { params: Promise<{ view: string }> }) {
  const { view } = await ctx.params;
  if (!(VIEWS as readonly string[]).includes(view)) return new Response("Visão inexistente.", { status: 404 });
  const v = view as View;
  if (v === "mmt" && !DIRECTORS_ENABLED) return new Response("Visão inexistente.", { status: 404 }); // área dos diretores oculta

  // Manter/Mudar/Treinar e o pacote são só da Diretoria Corporativa; ranking/heatmap seguem a liberação do admin.
  const { supabase } = await requireConsolidated({ adminOnly: v === "mmt" || v === "pacote" });
  const config = await loadConfig(supabase);
  const sp = request.nextUrl.searchParams;
  const segmentId = qp(sp.get("segment") ?? undefined);
  const buId = qp(sp.get("bu") ?? undefined);
  const classCode = qp(sp.get("class") ?? undefined);
  const type = MMT_TYPES.find((t) => t === qp(sp.get("type") ?? undefined));
  const segment = config.segments.find((s) => s.id === segmentId);
  const today = new Date().toISOString().slice(0, 10);

  const wb = newWorkbook();
  let name: string;

  if (v === "ranking") {
    addRankingSheet(wb, await loadRanking(supabase, config, { segmentId, buId, classCode }), config);
    name = `ranking-${segment ? fileSlug(segment.name) : "todos-os-segmentos"}`;
  } else if (v === "heatmap") {
    addHeatmapSheets(wb, await loadRanking(supabase, config), config.bus.filter((b) => b.active), config.activeSegments);
    name = "heatmap-bu-segmento";
  } else if (v === "comparativo") {
    const potencial = config.bands.find((b) => b.code === "potencial")?.min_score ?? 70;
    const p = parseCompareParams((k) => qp(sp.get(k) ?? undefined), potencial);
    const rows = await loadRanking(supabase, config, { segmentId, buId });
    addCompareSheets(wb, deliveryRisk(rows, p), painWithoutOpening(rows, p), config);
    name = `comparativo-criterios${segment ? "-" + fileSlug(segment.name) : ""}`;
  } else if (v === "mmt") {
    addMmtSheet(wb, await loadMmtRows(supabase, config, { segmentId, buId, type }));
    name = `manter-mudar-treinar${segment ? "-" + fileSlug(segment.name) : ""}`;
  } else {
    if (!segment) return new Response("Escolha um segmento para gerar o pacote.", { status: 400 });
    addRankingSheet(wb, await loadRanking(supabase, config, { segmentId: segment.id }), config, "1. Ranking");
    addPitchSheet(wb, await loadPitchRows(supabase, config, { segmentId: segment.id }), "2. Pitches");
    if (DIRECTORS_ENABLED) addMmtSheet(wb, await loadMmtRows(supabase, config, { segmentId: segment.id }), "3. Manter-Mudar-Treinar");
    name = `pacote-${fileSlug(segment.name)}`;
  }

  return new Response(await toXlsxBuffer(wb), {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${name}-${today}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
