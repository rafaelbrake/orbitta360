import { NextResponse, type NextRequest } from "next/server";
import { effectivePitch, type PitchData } from "@/lib/book";
import { loadSegmentLeaders } from "@/lib/data";
import { DIRECTORS_ENABLED, PITCH_EVALUATOR_ENABLED } from "@/lib/features";
import { evaluatePitch } from "@/lib/pitch-evaluator";
import { reevaluate } from "@/lib/pitch-reevaluate";
import type { PitchScoreRow } from "@/lib/pitch-score-hash";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * POST { segmentId, offerId }: reavalia o pitch salvo. É uma rota (e não uma ação de servidor) porque a chamada
 * demora, e ações de servidor rodam em fila no navegador: a sala continua decidindo enquanto a nota é calculada.
 */
export const maxDuration = 120;

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

export async function POST(request: NextRequest) {
  if (!DIRECTORS_ENABLED || !PITCH_EVALUATOR_ENABLED) return fail(404, "A reavaliação não está ligada.");
  // só aceita pedidos feitos pelas próprias telas do sistema
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || new URL(origin).host !== host) return fail(403, "Pedido recusado.");

  const body = (await request.json().catch(() => null)) as { segmentId?: unknown; offerId?: unknown } | null;
  const segmentId = body?.segmentId, offerId = body?.offerId;
  if (!isUuid(segmentId) || !isUuid(offerId)) return fail(400, "Dados inválidos.");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "Sessão expirada. Entre de novo.");
  const { data: profile } = await supabase.from("profiles").select("role,active").eq("id", user.id).single<{ role: string; active: boolean }>();
  const isLeader = ((await loadSegmentLeaders(supabase)).get(segmentId) ?? []).includes(user.id);
  if (!profile?.active || (profile.role !== "admin" && !isLeader)) return fail(403, "Só a Diretoria e o líder do segmento podem reavaliar.");

  const result = await reevaluate({
    loadPitch: async () => {
      const [head, leader, offer, segment] = await Promise.all([
        supabase.from("pitches").select("*").eq("segment_id", segmentId).eq("offer_id", offerId).maybeSingle(),
        supabase.from("segment_pitches").select("*").eq("segment_id", segmentId).eq("offer_id", offerId).maybeSingle(),
        supabase.from("offers").select("name,bu_id").eq("id", offerId).maybeSingle(),
        supabase.from("segments").select("name").eq("id", segmentId).maybeSingle(),
      ]);
      const { pitch } = effectivePitch(head.data as PitchData | null, leader.data as PitchData | null);
      if (!pitch || !offer.data || !segment.data) return null;
      const bu = await supabase.from("bus").select("code").eq("id", offer.data.bu_id).maybeSingle();
      return { pitch, oferta: offer.data.name as string, segmento: segment.data.name as string, bu: (bu.data?.code as string) ?? "—" };
    },
    loadScore: async () => {
      const { data } = await supabase.from("pitch_scores").select("offer_id,content_hash,levels,reasons,alerts,improvements,evaluator,evaluated_at").eq("segment_id", segmentId).eq("offer_id", offerId).maybeSingle();
      return (data as PitchScoreRow | null) ?? undefined;
    },
    evaluate: evaluatePitch,
    // só a Diretoria escreve notas pelo banco; aqui o acesso já foi conferido acima, então grava com a chave de serviço
    save: async (row) => {
      const { error } = await createAdminClient().from("pitch_scores").upsert({ ...row, segment_id: segmentId, offer_id: offerId }, { onConflict: "segment_id,offer_id" });
      if (error) throw new Error(error.message);
    },
  }).catch((error: unknown) => {
    console.error("Reavaliação do pitch:", error);
    return { ok: false as const, status: 500, error: "Não foi possível reavaliar agora. Tente de novo." };
  });

  return result.ok ? NextResponse.json(result) : fail(result.status, result.error);
}
