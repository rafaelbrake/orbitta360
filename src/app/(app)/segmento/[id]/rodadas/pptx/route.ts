import { redirect } from "next/navigation";
import { fileSlug } from "@/lib/exports";
import { DIRECTORS_ENABLED } from "@/lib/features";
import { buildSegmentDeck } from "@/lib/segment-deck";
import { requireSegmentAccess } from "@/lib/segment-data";
import { loadSegmentPlan } from "@/lib/segment-plan";
import { PPTX_MIME, renderPptx } from "@/lib/segment-pptx";
import { homeFor, requireProfile } from "@/lib/session";

/** Apresentação (PPT) do que o segmento construiu nas rodadas, com o que está salvo agora. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!DIRECTORS_ENABLED) {
    const { profile } = await requireProfile();
    redirect(homeFor(profile.role));
  }
  const { id } = await params;
  const { supabase, config, segment } = await requireSegmentAccess(id); // Diretoria ou líder do segmento
  const plan = await loadSegmentPlan(supabase, config, segment);
  const file = await renderPptx(buildSegmentDeck(plan), `Portfólio 2027 · ${segment.name}`);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": PPTX_MIME,
      "Content-Disposition": `attachment; filename="orbitta360-${fileSlug(segment.name)}-${today}.pptx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
