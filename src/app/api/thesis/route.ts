import { NextResponse, type NextRequest } from "next/server";
import { loadConfig, loadSegmentLeaders } from "@/lib/data";
import { DIRECTORS_ENABLED, THESIS_ENABLED } from "@/lib/features";
import { loadSegmentPlan } from "@/lib/segment-plan";
import { createClient } from "@/lib/supabase/server";
import { ThesisError, generateThesis } from "@/lib/thesis-generator";

/**
 * POST { segmentId }: rascunho da tese a partir do que está salvo nas rodadas. Só devolve o texto; quem grava é o líder,
 * pela tela. É uma rota (e não uma ação de servidor) porque a chamada demora.
 */
export const maxDuration = 120;

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

export async function POST(request: NextRequest) {
  if (!DIRECTORS_ENABLED || !THESIS_ENABLED) return fail(404, "A geração da tese não está ligada.");
  // só aceita pedidos feitos pelas próprias telas do sistema
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || new URL(origin).host !== host) return fail(403, "Pedido recusado.");

  const body = (await request.json().catch(() => null)) as { segmentId?: unknown } | null;
  const segmentId = body?.segmentId;
  if (!isUuid(segmentId)) return fail(400, "Dados inválidos.");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "Sessão expirada. Entre de novo.");
  const { data: profile } = await supabase.from("profiles").select("role,active").eq("id", user.id).single<{ role: string; active: boolean }>();
  const isLeader = ((await loadSegmentLeaders(supabase)).get(segmentId) ?? []).includes(user.id);
  if (!profile?.active || (profile.role !== "admin" && !isLeader)) return fail(403, "Só a Diretoria e o líder do segmento podem gerar a tese.");

  try {
    const config = await loadConfig(supabase);
    const segment = config.segments.find((s) => s.id === segmentId);
    if (!segment) return fail(404, "Segmento não encontrado.");
    const plan = await loadSegmentPlan(supabase, config, segment);
    if (!plan.rounds.some((r) => r.foco.length)) return fail(409, "Escolha pelo menos uma oferta em Foco nas rodadas antes de gerar a tese.");
    return NextResponse.json({ ok: true, ...(await generateThesis(plan)) });
  } catch (error) {
    if (error instanceof ThesisError) return fail(502, error.message);
    console.error("Tese do segmento:", error);
    return fail(500, "Não foi possível gerar a tese agora. Tente de novo.");
  }
}
