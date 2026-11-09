import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/consolidated";
import { progressOf } from "@/lib/data";
import { isViewFilled } from "@/lib/regional";
import { DEFAULT_FOCO_LIMIT, type Level } from "@/lib/segment";
import type { Bu, EvaluationScored, Offer, Segment } from "@/lib/types";

/** Acompanhamento de um segmento para a Diretoria: heads, líder, regionais e andamento da consolidação. */
export interface SegmentOverview {
  segment: Segment;
  /** avaliações dos heads neste segmento: feitas / possíveis (ofertas classificáveis de todas as BUs) */
  evals: { done: number; total: number };
  levels: Record<Level, number> & { semNivel: number };
  focoLimit: number;
  thesis: boolean; message: boolean;
  status: "draft" | "final";
  finalizedAt: string | null;
  /** ajustes pedidos na reunião que ainda não foram feitos */
  pendingAdjustments: number;
  regionalViews: number; highlights: number; leaderPitches: number;
}

export interface SegmentOverviewInput {
  segments: Segment[]; offers: Offer[]; evals: EvaluationScored[];
  priorities: { segment_id: string; offer_id: string; level: Level; review_note: string | null; review_done: boolean }[];
  strategies: { segment_id: string; thesis: string | null; message: string | null; foco_limit: number; status: string; finalized_at: string | null }[];
  views: { segment_id: string; works: string | null; not_works: string | null }[];
  mmt: { segment_id: string }[];
  leaderPitches: { segment_id: string }[];
}

/** Junta os números de cada segmento ativo. Puro: recebe tudo já lido. */
export function summarizeSegments(i: SegmentOverviewInput): SegmentOverview[] {
  return i.segments.map((segment) => {
    const p = progressOf(i.offers, [segment], i.evals.filter((e) => e.segment_id === segment.id));
    const pr = i.priorities.filter((x) => x.segment_id === segment.id);
    const st = i.strategies.find((x) => x.segment_id === segment.id);
    const levels = { foco: 0, apoio: 0, fora: 0, semNivel: 0 };
    for (const x of pr) levels[x.level]++;
    levels.semNivel = Math.max(0, i.evals.filter((e) => e.segment_id === segment.id && e.score != null && !e.not_applicable).length - pr.length);
    return {
      segment, evals: p, levels, focoLimit: st?.foco_limit ?? DEFAULT_FOCO_LIMIT,
      thesis: (st?.thesis ?? "").trim() !== "", message: (st?.message ?? "").trim() !== "",
      status: st?.status === "final" ? "final" : "draft", finalizedAt: st?.finalized_at ?? null,
      pendingAdjustments: pr.filter((x) => (x.review_note ?? "").trim() !== "" && !x.review_done).length,
      regionalViews: i.views.filter((v) => v.segment_id === segment.id && isViewFilled(v)).length,
      highlights: i.mmt.filter((m) => m.segment_id === segment.id).length,
      leaderPitches: i.leaderPitches.filter((x) => x.segment_id === segment.id).length,
    };
  });
}

/** Lê tudo (a Diretoria enxerga todos os segmentos) e resume. */
export async function loadSegmentOverview(supabase: SupabaseClient, ref: { activeSegments: Segment[]; bus: Bu[] }): Promise<SegmentOverview[]> {
  const [offers, evals, pr, st, views, mmt, lp] = await Promise.all([
    fetchAll<Offer>((a, b) => supabase.from("offers").select("*").order("id").range(a, b)),
    fetchAll<EvaluationScored>((a, b) => supabase.from("evaluations_scored").select("*").order("id").range(a, b)),
    supabase.from("segment_priorities").select("segment_id,offer_id,level,review_note,review_done"),
    supabase.from("segment_strategies").select("segment_id,thesis,message,foco_limit,status,finalized_at"),
    supabase.from("regional_views").select("segment_id,works,not_works"),
    supabase.from("mmt_records").select("segment_id"),
    supabase.from("segment_pitches").select("segment_id"),
  ]);
  return summarizeSegments({
    segments: ref.activeSegments, offers, evals,
    priorities: (pr.data ?? []) as SegmentOverviewInput["priorities"], strategies: (st.data ?? []) as SegmentOverviewInput["strategies"],
    views: (views.data ?? []) as SegmentOverviewInput["views"], mmt: (mmt.data ?? []) as SegmentOverviewInput["mmt"], leaderPitches: (lp.data ?? []) as SegmentOverviewInput["leaderPitches"],
  });
}
