"use server";

import { revalidatePath } from "next/cache";
import { flash } from "@/lib/flash";
import { loadConfig } from "@/lib/data";
import { loadRanking } from "@/lib/consolidated";
import { requireProfile } from "@/lib/session";
import { DEFAULT_FOCO_LIMIT, cleanNote, cleanText, isLevel, planSuggestion, type Level } from "@/lib/segment";
import type { SaveResult } from "@/app/actions/bu";

const BLOCKED = "Edição bloqueada: a versão final está travada ou você não lidera este segmento.";
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const friendly = (e: { code?: string; message: string }) =>
  e.code === "42501" || /row-level security/i.test(e.message) ? BLOCKED : e.message;

/** Autosave da estratégia do segmento (tese e mensagem aos vendedores). */
export async function saveStrategy(segmentId: string, v: { thesis: string; message: string }): Promise<SaveResult> {
  const { supabase } = await requireProfile();
  if (!isUuid(segmentId)) return { ok: false, error: "Dados inválidos." };
  const row = { thesis: cleanText(v.thesis), message: cleanText(v.message) };
  // Atualiza; se a linha ainda não existe, cria. (O upsert do Supabase também reescreve a coluna segment_id,
  // que não tem permissão de atualização: por isso são dois passos.)
  const up = await supabase.from("segment_strategies").update(row).eq("segment_id", segmentId).select("segment_id");
  if (up.error) return { ok: false, error: friendly(up.error) };
  if (up.data?.length) return { ok: true, savedAt: new Date().toISOString() };
  const ins = await supabase.from("segment_strategies").insert({ segment_id: segmentId, ...row }).select("segment_id");
  if (ins.error) return { ok: false, error: ins.error.code === "23505" ? BLOCKED : friendly(ins.error) }; // já existe e não deixou atualizar: versão travada
  return { ok: true, savedAt: new Date().toISOString() };
}

/** Define (ou limpa, com level = null) o nível de uma oferta no segmento. O limite de Foco é do banco. */
export async function setPriority(segmentId: string, offerId: string, level: Level | null, note?: string | null): Promise<SaveResult> {
  const { supabase } = await requireProfile();
  if (!isUuid(segmentId) || !isUuid(offerId)) return { ok: false, error: "Dados inválidos." };
  if (level === null) {
    const { error } = await supabase.from("segment_priorities").delete().eq("segment_id", segmentId).eq("offer_id", offerId);
    if (error) return { ok: false, error: friendly(error) };
    return { ok: true, savedAt: new Date().toISOString() };
  }
  if (!isLevel(level)) return { ok: false, error: "Nível inválido." };
  const row: Record<string, unknown> = { segment_id: segmentId, offer_id: offerId, level };
  if (note !== undefined) row.note = cleanNote(note);
  const { data, error } = await supabase.from("segment_priorities").upsert(row, { onConflict: "segment_id,offer_id" }).select("offer_id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return { ok: false, error: BLOCKED };
  return { ok: true, savedAt: new Date().toISOString() };
}

/** Só a justificativa curta de uma oferta que já tem nível. */
export async function setPriorityNote(segmentId: string, offerId: string, note: string): Promise<SaveResult> {
  const { supabase } = await requireProfile();
  if (!isUuid(segmentId) || !isUuid(offerId)) return { ok: false, error: "Dados inválidos." };
  const { data, error } = await supabase.from("segment_priorities").update({ note: cleanNote(note) }).eq("segment_id", segmentId).eq("offer_id", offerId).select("offer_id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return { ok: false, error: "Defina primeiro o nível da oferta." };
  return { ok: true, savedAt: new Date().toISOString() };
}

/** Preenche o nível das ofertas que ainda não têm, a partir da faixa dos heads (Foco até o limite). */
export async function applySuggestion(fd: FormData) {
  const segmentId = String(fd.get("segment_id"));
  const back = `/segmento/${segmentId}`;
  const { supabase } = await requireProfile();
  if (!isUuid(segmentId)) flash("/segmento", "erro", "Segmento inválido.");
  const config = await loadConfig(supabase);
  const [rows, cur, strat] = await Promise.all([
    loadRanking(supabase, config, { segmentId }),
    supabase.from("segment_priorities").select("offer_id,level").eq("segment_id", segmentId),
    supabase.from("segment_strategies").select("foco_limit").eq("segment_id", segmentId).maybeSingle(),
  ]);
  const current = new Map<string, Level>((cur.data ?? []).map((r) => [r.offer_id as string, r.level as Level]));
  const plan = planSuggestion(rows.map((r) => ({ offerId: r.offerId, classCode: r.classCode, score: r.score })), current, strat.data?.foco_limit ?? DEFAULT_FOCO_LIMIT);
  if (plan.size === 0) flash(back, "ok", "Todas as ofertas já têm nível.");
  // Foco primeiro, para ocupar as vagas antes do limite ser conferido pelo banco
  const ordered = [...plan.entries()].sort((a, b) => Number(b[1] === "foco") - Number(a[1] === "foco"));
  const { error } = await supabase.from("segment_priorities").upsert(ordered.map(([offer_id, level]) => ({ segment_id: segmentId, offer_id, level })), { onConflict: "segment_id,offer_id" });
  if (error) flash(back, "erro", friendly(error));
  revalidatePath(back);
  flash(back, "ok", `Sugestão aplicada a ${plan.size} ${plan.size === 1 ? "oferta" : "ofertas"}. Ajuste o que quiser.`);
}

export async function finalizeSegment(fd: FormData) {
  const segmentId = String(fd.get("segment_id"));
  const back = `/segmento/${segmentId}`;
  const { supabase } = await requireProfile();
  const { error } = await supabase.rpc("finalize_segment", { p_segment: segmentId });
  if (error) flash(back, "erro", error.message);
  revalidatePath(back);
  flash(back, "ok", "Versão final travada. Para mexer de novo, a Diretoria Corporativa precisa reabrir.");
}

export async function reopenSegment(fd: FormData) {
  const segmentId = String(fd.get("segment_id"));
  const back = `/segmento/${segmentId}`;
  const { supabase } = await requireProfile("admin");
  const { error } = await supabase.rpc("reopen_segment", { p_segment: segmentId });
  if (error) flash(back, "erro", error.message);
  revalidatePath(back);
  flash(back, "ok", "Versão reaberta para edição.");
}
