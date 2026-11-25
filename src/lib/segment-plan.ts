import type { SupabaseClient } from "@supabase/supabase-js";
import { effectivePitch, type PitchData } from "@/lib/book";
import { loadRanking } from "@/lib/consolidated";
import type { loadConfig } from "@/lib/data";
import { isViewFilled } from "@/lib/regional";
import { buildActionItems, customToItem, type ActionItem, type ActionPlanLite, type MmtRecordLite, type RoundActionItemRow } from "@/lib/rounds";
import { loadRounds } from "@/lib/rounds-data";
import type { Level } from "@/lib/segment";
import type { Segment } from "@/lib/types";

/** O que o segmento construiu nas rodadas: base da apresentação (PPT) e do rascunho de tese. */
export interface PlanOffer { offerId: string; name: string; buCode: string; score: number; note: string | null; pitch: PitchData | null }
export interface PlanRound {
  id: string; position: number; name: string; buCodes: string[];
  foco: PlanOffer[]; apoio: string[]; fora: string[];
  /** pontos do plano de ação já decididos (os descartados ficam de fora) */
  items: ActionItem[];
}
export interface SegmentPlan {
  segmentName: string; leader: string | null; thesis: string; message: string; final: boolean;
  rounds: PlanRound[];
  regional: { regional: string; works: string | null; not_works: string | null }[];
}

type Config = Awaited<ReturnType<typeof loadConfig>>;
type Row = Record<string, unknown>;

function must<T>(r: { data: T; error: { message: string } | null }): T {
  // melhor falhar do que gerar uma apresentação com partes faltando sem ninguém perceber
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

export async function loadSegmentPlan(supabase: SupabaseClient, config: Config, segment: Segment): Promise<SegmentPlan> {
  const id = segment.id;
  const rounds = await loadRounds(supabase);
  const [ranking, prR, stR, headR, leaderR, viewsR, mmtR, planR, newR] = await Promise.all([
    loadRanking(supabase, config, { segmentId: id }),
    supabase.from("round_priorities").select("offer_id,round_id,level,note").eq("segment_id", id),
    supabase.from("segment_strategies").select("thesis,message,status").eq("segment_id", id).maybeSingle(),
    supabase.from("pitches").select("*").eq("segment_id", id),
    supabase.from("segment_pitches").select("*").eq("segment_id", id),
    supabase.from("regional_views").select("regional,works,not_works").eq("segment_id", id),
    supabase.from("mmt_records").select("id,type,bu_id,offer_id,regional,priority,headline,evidence,action,indicator,audience").eq("segment_id", id),
    supabase.from("mmt_action_plan").select("record_id,decision,owner,due_date,note").eq("segment_id", id),
    supabase.from("round_action_items").select("id,round_id,type,bu_id,headline,action,owner,due_date,note").eq("segment_id", id).order("created_at"),
  ]);

  const strategy = must(stR) as { thesis: string | null; message: string | null; status: string } | null;
  const prio = new Map((must(prR) as Row[]).map((r) => [`${r.round_id}:${r.offer_id}`, { level: r.level as Level, note: (r.note as string | null) ?? null }]));
  const head = new Map((must(headR) as Row[]).map((r) => [r.offer_id as string, r as unknown as PitchData]));
  const leader = new Map((must(leaderR) as Row[]).map((r) => [r.offer_id as string, r as unknown as PitchData]));
  const mmt = must(mmtR) as MmtRecordLite[];
  const plans = new Map((must(planR) as ActionPlanLite[]).map((p) => [p.record_id, p]));
  const newItems = must(newR) as (RoundActionItemRow & { round_id: string })[];
  const buCode = new Map(config.bus.map((b) => [b.id, b.code]));

  const offerIds = [...new Set(mmt.map((m) => m.offer_id).filter((x): x is string => !!x))];
  const offerName = new Map(
    offerIds.length ? (must(await supabase.from("offers").select("id,name").in("id", offerIds)) as Row[]).map((o) => [o.id as string, o.name as string]) : [],
  );

  return {
    segmentName: segment.name, leader: segment.leader ?? null, thesis: strategy?.thesis ?? "", message: strategy?.message ?? "", final: strategy?.status === "final",
    rounds: rounds.map((round) => {
      const buIds = new Set(round.buIds);
      const foco: PlanOffer[] = [], apoio: string[] = [], fora: string[] = [];
      for (const r of ranking.filter((x) => buIds.has(x.bu.id))) {
        const p = prio.get(`${round.id}:${r.offerId}`);
        if (p?.level === "foco") {
          foco.push({ offerId: r.offerId, name: r.offerName, buCode: r.bu.code, score: r.score, note: p.note, pitch: effectivePitch(head.get(r.offerId), leader.get(r.offerId)).pitch });
        } else if (p?.level === "apoio") apoio.push(r.offerName);
        else if (p?.level === "fora") fora.push(r.offerName);
      }
      foco.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pt-BR"));
      const items = [
        ...buildActionItems(mmt, plans, buIds, buCode, offerName),
        ...newItems.filter((n) => n.round_id === round.id).map((n) => customToItem(n, buCode)),
      ].filter((i) => i.decision && i.decision !== "descartado");
      return { id: round.id, position: round.position, name: round.name, buCodes: round.buIds.map((b) => buCode.get(b) ?? "—").sort(), foco, apoio, fora, items };
    }),
    regional: (must(viewsR) as { regional: string | null; works: string | null; not_works: string | null }[])
      .filter((v) => isViewFilled(v)).map((v) => ({ regional: v.regional || "—", works: v.works, not_works: v.not_works })),
  };
}
