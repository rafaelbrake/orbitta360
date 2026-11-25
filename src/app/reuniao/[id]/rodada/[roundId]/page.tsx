import { notFound, redirect } from "next/navigation";
import { RoundDeck } from "@/components/RoundDeck";
import { effectivePitch, type PitchData } from "@/lib/book";
import { loadRanking } from "@/lib/consolidated";
import { DIRECTORS_ENABLED, PITCH_EVALUATOR_ENABLED, ROUND_CONTEXT_ENABLED } from "@/lib/features";
import { isViewFilled } from "@/lib/regional";
import { toPitchScore, type PitchScoreRow } from "@/lib/pitch-score-hash";
import { buildActionItems, customToItem, type ActionPlanLite, type MmtRecordLite, type RoundActionItemRow, type RoundRow } from "@/lib/rounds";
import { loadRounds } from "@/lib/rounds-data";
import { orderBlocks, toBlock, type BlockRow } from "@/lib/round-context";
import type { Level } from "@/lib/segment";
import { requireSegmentAccess } from "@/lib/segment-data";
import { homeFor, requireProfile } from "@/lib/session";

type Row = Record<string, unknown>;

/** Uma rodada da reunião: o líder do segmento com o grupo de BUs, em tela cheia. */
export default async function RodadaPage({ params, searchParams }: { params: Promise<{ id: string; roundId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!DIRECTORS_ENABLED) {
    const { profile } = await requireProfile();
    redirect(homeFor(profile.role));
  }
  const { id, roundId } = await params;
  const sp = await searchParams;
  const { supabase, config, segment, isAdmin, isLeader } = await requireSegmentAccess(id);
  const rounds = await loadRounds(supabase);
  const pos = rounds.findIndex((r) => r.id === roundId);
  if (pos < 0) notFound();
  const round = rounds[pos];
  const buIds = new Set(round.buIds);

  const [ranking, prR, stR, headR, leaderR, viewsR, mmtR, planR, noteR, draftR, newR, ctxR, scoreR] = await Promise.all([
    loadRanking(supabase, config, { segmentId: id }),
    supabase.from("round_priorities").select("offer_id,level,note,pitch_validated").eq("segment_id", id).eq("round_id", roundId),
    supabase.from("segment_strategies").select("status").eq("segment_id", id).maybeSingle(),
    supabase.from("pitches").select("*").eq("segment_id", id),
    supabase.from("segment_pitches").select("*").eq("segment_id", id),
    supabase.from("regional_views").select("regional,works,not_works").eq("segment_id", id),
    supabase.from("mmt_records").select("id,type,bu_id,offer_id,regional,priority,headline,evidence,action,indicator,audience").eq("segment_id", id),
    supabase.from("mmt_action_plan").select("record_id,decision,owner,due_date,note").eq("segment_id", id),
    supabase.from("round_notes").select("notes").eq("segment_id", id).eq("round_id", roundId).maybeSingle(),
    supabase.from("segment_priorities").select("offer_id").eq("segment_id", id).limit(1),
    supabase.from("round_action_items").select("id,type,bu_id,headline,action,owner,due_date,note").eq("segment_id", id).eq("round_id", roundId).order("created_at"),
    ROUND_CONTEXT_ENABLED
      ? supabase.from("round_context_blocks").select("id,round_id,segment_id,position,kind,title,subtitle,body,source,note").eq("round_id", roundId).or(`segment_id.is.null,segment_id.eq.${id}`)
      : Promise.resolve({ data: [] }),
    supabase.from("pitch_scores").select("offer_id,content_hash,levels,reasons,alerts,improvements,evaluator,evaluated_at").eq("segment_id", id),
  ]);
  const rows = ranking.filter((r) => buIds.has(r.bu.id));
  const offerIds = rows.map((r) => r.offerId);
  const { data: offerRows } = offerIds.length ? await supabase.from("offers").select("id,description,revenue_model,ticket_medio").in("id", offerIds) : { data: [] };
  const offerInfo = new Map((offerRows ?? []).map((o) => [o.id as string, o as { description: string | null; revenue_model: string | null; ticket_medio: number | null }]));

  const prio = new Map<string, { level: Level; note: string | null; pitch_validated: boolean }>(
    (prR.data ?? []).map((r) => [r.offer_id as string, { level: r.level as Level, note: (r.note as string | null) ?? null, pitch_validated: r.pitch_validated === true }]),
  );
  const head = new Map<string, PitchData>(((headR.data ?? []) as Row[]).map((r) => [r.offer_id as string, r as unknown as PitchData]));
  const leader = new Map<string, PitchData>(((leaderR.data ?? []) as Row[]).map((r) => [r.offer_id as string, r as unknown as PitchData]));
  const mmt = (mmtR.data ?? []) as MmtRecordLite[];
  const scores = new Map(((scoreR.data ?? []) as PitchScoreRow[]).map((s) => [s.offer_id, s]));
  const signals = new Map<string, { regional: string; type: string }[]>();
  for (const m of mmt) if (m.offer_id) signals.set(m.offer_id, [...(signals.get(m.offer_id) ?? []), { regional: m.regional || "—", type: m.type }]);
  const bandLabel = Object.fromEntries(config.bands.map((b) => [b.code, b.label]));

  const deckRows: RoundRow[] = rows.map((r) => {
    const pr = prio.get(r.offerId);
    const info = offerInfo.get(r.offerId);
    const { pitch, source } = effectivePitch(head.get(r.offerId), leader.get(r.offerId));
    return {
      offerId: r.offerId, code: r.offerCode, name: r.offerName, buCode: r.bu.code, score: r.score, classCode: r.classCode, classLabel: bandLabel[r.classCode] ?? r.classCode,
      level: pr?.level ?? null, note: pr?.note ?? null, pitchValidated: pr?.pitch_validated ?? false,
      pitch, pitchSource: source, description: info?.description ?? null, revenueModel: info?.revenue_model ?? null, ticket: info?.ticket_medio != null ? Number(info.ticket_medio) : null,
      signals: signals.get(r.offerId) ?? [],
      pitchScore: toPitchScore(scores.get(r.offerId), pitch),
    };
  });

  const mmtOfferIds = [...new Set(mmt.filter((m) => buIds.has(m.bu_id)).map((m) => m.offer_id).filter((x): x is string => !!x))];
  const { data: mmtOffers } = mmtOfferIds.length ? await supabase.from("offers").select("id,name").in("id", mmtOfferIds) : { data: [] };
  const items = [
    ...buildActionItems(
      mmt, new Map(((planR.data ?? []) as ActionPlanLite[]).map((p) => [p.record_id, p])), buIds,
      new Map(config.bus.map((b) => [b.id, b.code])), new Map((mmtOffers ?? []).map((o) => [o.id as string, o.name as string])),
    ),
    ...((newR.data ?? []) as RoundActionItemRow[]).map((r) => customToItem(r, new Map(config.bus.map((b) => [b.id, b.code])))),
  ];
  const regional = ((viewsR.data ?? []) as { regional: string | null; works: string | null; not_works: string | null }[])
    .filter((v) => isViewFilled(v)).map((v) => ({ regional: v.regional || "—", works: v.works, not_works: v.not_works }));
  const final = stR.data?.status === "final";
  const buCodeById = new Map(config.bus.map((b) => [b.id, b.code]));

  return (
    <RoundDeck
      segmentId={id} segmentName={segment.name} leader={segment.leader} final={final} canEdit={(isAdmin || isLeader) && !final} canEditPlan={isAdmin || isLeader} canReevaluate={PITCH_EVALUATOR_ENABLED && (isAdmin || isLeader)}
      round={{ id: round.id, position: round.position, name: round.name, context: ROUND_CONTEXT_ENABLED ? round.context : null, focoLimit: round.focoLimit, buCodes: round.buIds.map((b) => buCodeById.get(b) ?? "—").sort(), buOptions: round.buIds.map((b) => ({ id: b, code: buCodeById.get(b) ?? "—" })).sort((a, b) => a.code.localeCompare(b.code)) }}
      roundCount={rounds.length} prevRoundId={rounds[pos - 1]?.id ?? null} nextRoundId={rounds[pos + 1]?.id ?? null}
      blocks={orderBlocks(((ctxR.data ?? []) as BlockRow[]).map(toBlock).filter((b): b is NonNullable<typeof b> => b !== null))}
      rows={deckRows} items={items} regional={regional} notes={(noteR.data?.notes as string | null) ?? ""} hasDraft={(draftR.data ?? []).length > 0}
      initialKey={typeof sp.s === "string" ? sp.s : undefined}
    />
  );
}
