import { redirect } from "next/navigation";
import { MeetingDeck, type DeckRow } from "@/components/MeetingDeck";
import { effectivePitch, type PitchData } from "@/lib/book";
import { loadRanking } from "@/lib/consolidated";
import { DIRECTORS_ENABLED } from "@/lib/features";
import { isViewFilled } from "@/lib/regional";
import { DEFAULT_FOCO_LIMIT, type Level } from "@/lib/segment";
import { requireSegmentAccess } from "@/lib/segment-data";
import { homeFor, requireProfile } from "@/lib/session";

type Row = Record<string, unknown>;

/** Modo reunião: o segmento em tela cheia, para projetar, criticar e fechar a versão final. */
export default async function ReuniaoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!DIRECTORS_ENABLED) {
    const { profile } = await requireProfile();
    redirect(homeFor(profile.role));
  }
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, config, segment, isAdmin, isLeader } = await requireSegmentAccess(id);

  const [rows, prR, stR, headR, leaderR, viewsR, mmtR] = await Promise.all([
    loadRanking(supabase, config, { segmentId: id }),
    supabase.from("segment_priorities").select("offer_id,level,note,review_note,review_done").eq("segment_id", id),
    supabase.from("segment_strategies").select("thesis,message,meeting_notes,status,foco_limit").eq("segment_id", id).maybeSingle(),
    supabase.from("pitches").select("*").eq("segment_id", id),
    supabase.from("segment_pitches").select("*").eq("segment_id", id),
    supabase.from("regional_views").select("regional,works,not_works").eq("segment_id", id),
    supabase.from("mmt_records").select("type,offer_id,regional").eq("segment_id", id),
  ]);
  const st = stR.data as { thesis: string | null; message: string | null; meeting_notes: string | null; status: string; foco_limit: number } | null;
  const final = st?.status === "final";
  const prio = new Map<string, { level: Level; note: string | null; review_note: string | null; review_done: boolean }>(
    (prR.data ?? []).map((r) => [r.offer_id as string, { level: r.level as Level, note: (r.note as string | null) ?? null, review_note: (r.review_note as string | null) ?? null, review_done: r.review_done === true }]),
  );
  const head = new Map<string, PitchData>(((headR.data ?? []) as Row[]).map((r) => [r.offer_id as string, r as unknown as PitchData]));
  const leader = new Map<string, PitchData>(((leaderR.data ?? []) as Row[]).map((r) => [r.offer_id as string, r as unknown as PitchData]));
  const signals = new Map<string, { regional: string; type: string }[]>();
  for (const m of (mmtR.data ?? []) as { type: string; offer_id: string | null; regional: string | null }[]) if (m.offer_id) signals.set(m.offer_id, [...(signals.get(m.offer_id) ?? []), { regional: m.regional || "—", type: m.type }]);
  const { data: offerRows } = rows.length ? await supabase.from("offers").select("id,description").in("id", rows.map((r) => r.offerId)) : { data: [] };
  const desc = new Map((offerRows ?? []).map((o) => [o.id as string, (o.description as string | null) ?? null]));
  const bandLabel = Object.fromEntries(config.bands.map((b) => [b.code, b.label]));

  const deckRows: DeckRow[] = rows.map((r) => {
    const pr = prio.get(r.offerId);
    const { pitch, source } = effectivePitch(head.get(r.offerId), leader.get(r.offerId));
    return {
      offerId: r.offerId, code: r.offerCode, name: r.offerName, buCode: r.bu.code, score: r.score, classCode: r.classCode, classLabel: bandLabel[r.classCode] ?? r.classCode,
      level: pr?.level ?? null, note: pr?.note ?? null, reviewNote: pr?.review_note ?? null, reviewDone: pr?.review_done ?? false,
      pitch, pitchSource: source, description: desc.get(r.offerId) ?? null, signals: signals.get(r.offerId) ?? [],
    };
  });
  const regional = ((viewsR.data ?? []) as { regional: string | null; works: string | null; not_works: string | null }[])
    .filter((v) => isViewFilled(v)).map((v) => ({ regional: v.regional || "—", works: v.works, not_works: v.not_works }));

  return (
    <MeetingDeck
      segmentId={id} segmentName={segment.name} leader={segment.leader} final={final} canEdit={(isAdmin || isLeader) && !final}
      focoLimit={st?.foco_limit ?? DEFAULT_FOCO_LIMIT}
      strategy={{ thesis: st?.thesis ?? "", message: st?.message ?? "", notes: st?.meeting_notes ?? "" }}
      rows={deckRows} regional={regional}
      stats={{ bus: new Set(rows.map((r) => r.bu.id)).size, busTotal: config.bus.filter((b) => b.active).length, scored: rows.length }}
      initialKey={typeof sp.s === "string" ? sp.s : undefined}
    />
  );
}
