"use server";

import { revalidatePath } from "next/cache";
import { flash } from "@/lib/flash";
import { requireProfile } from "@/lib/session";
import { cleanNote, cleanText, isLevel, type Level } from "@/lib/segment";
import { cleanActionNote, cleanContext, cleanDueDate, cleanHeadline, cleanLimit, cleanOwner, cleanType, isDecision, planDraftCopy, type Decision, type RoundActionItemRow } from "@/lib/rounds";
import { cleanShort, cleanTitle, isBlockKind, parseBody, type BlockKind } from "@/lib/round-context";
import type { SaveResult } from "@/app/actions/bu";

const BLOCKED = "Edição bloqueada: a versão final está travada ou você não lidera este segmento.";
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const friendly = (e: { code?: string; message: string }) =>
  e.code === "42501" || /row-level security/i.test(e.message) ? BLOCKED : e.message;
/** O plano de ação não trava com a versão final: o único motivo de recusa é não liderar o segmento. */
const PLAN_BLOCKED = "Sem permissão: só o líder do segmento e a Diretoria mexem no plano de ação.";
const planFriendly = (e: { code?: string; message: string }) => (e.code === "42501" || /row-level security/i.test(e.message) ? PLAN_BLOCKED : e.message);
const done = (): SaveResult => ({ ok: true, savedAt: new Date().toISOString() });

/** Define (ou limpa, com level = null) o nível de uma oferta na rodada. O limite de Foco da rodada é do banco. */
export async function setRoundPriority(segmentId: string, offerId: string, level: Level | null, note?: string | null): Promise<SaveResult> {
  const { supabase } = await requireProfile();
  if (!isUuid(segmentId) || !isUuid(offerId)) return { ok: false, error: "Dados inválidos." };
  if (level === null) {
    const { error } = await supabase.from("round_priorities").delete().eq("segment_id", segmentId).eq("offer_id", offerId);
    if (error) return { ok: false, error: friendly(error) };
    return done();
  }
  if (!isLevel(level)) return { ok: false, error: "Nível inválido." };
  const row: Record<string, unknown> = { segment_id: segmentId, offer_id: offerId, level };
  if (note !== undefined) row.note = cleanNote(note);
  const { data, error } = await supabase.from("round_priorities").upsert(row, { onConflict: "segment_id,offer_id" }).select("offer_id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return { ok: false, error: BLOCKED };
  return done();
}

/** Justificativa curta de uma oferta que já tem nível na rodada. */
export async function setRoundPriorityNote(segmentId: string, offerId: string, note: string): Promise<SaveResult> {
  const { supabase } = await requireProfile();
  if (!isUuid(segmentId) || !isUuid(offerId)) return { ok: false, error: "Dados inválidos." };
  const { data, error } = await supabase.from("round_priorities").update({ note: cleanNote(note) }).eq("segment_id", segmentId).eq("offer_id", offerId).select("offer_id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return { ok: false, error: "Defina primeiro o nível da oferta (ou a versão final está travada)." };
  return done();
}

/** Marca (ou desmarca) o pitch como conferido na sala. */
export async function setPitchValidated(segmentId: string, offerId: string, validated: boolean): Promise<SaveResult> {
  const { supabase } = await requireProfile();
  if (!isUuid(segmentId) || !isUuid(offerId)) return { ok: false, error: "Dados inválidos." };
  const { data, error } = await supabase.from("round_priorities").update({ pitch_validated: validated === true }).eq("segment_id", segmentId).eq("offer_id", offerId).select("offer_id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return { ok: false, error: BLOCKED };
  return done();
}

/**
 * Decisão sobre um ponto dos regionais (plano de ação). Sem decisão (null) o ponto volta a pendente
 * e responsável, prazo e observação são descartados.
 */
export async function saveActionItem(recordId: string, v: { decision: Decision | null; owner: string; due: string; note: string }): Promise<SaveResult> {
  const { supabase } = await requireProfile();
  if (!isUuid(recordId)) return { ok: false, error: "Dados inválidos." };
  if (v.decision === null) {
    const { error } = await supabase.from("mmt_action_plan").delete().eq("record_id", recordId);
    if (error) return { ok: false, error: planFriendly(error) };
    return done();
  }
  if (!isDecision(v.decision)) return { ok: false, error: "Decisão inválida." };
  const due = (v.due ?? "").trim() === "" ? null : cleanDueDate(v.due);
  if ((v.due ?? "").trim() !== "" && due === null) return { ok: false, error: "Prazo inválido." };
  const row = { record_id: recordId, decision: v.decision, owner: cleanOwner(v.owner), due_date: due, note: cleanActionNote(v.note) };
  const { data, error } = await supabase.from("mmt_action_plan").upsert(row, { onConflict: "record_id" }).select("record_id");
  if (error) return { ok: false, error: planFriendly(error) };
  if (!data?.length) return { ok: false, error: PLAN_BLOCKED };
  return done();
}

export interface ItemInput { type: string; buId: string; headline: string; action: string; owner: string; due: string; note: string }

function itemRow(v: ItemInput): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const headline = cleanHeadline(v.headline);
  if (!headline) return { ok: false, error: "Escreva o item." };
  const due = (v.due ?? "").trim() === "" ? null : cleanDueDate(v.due);
  if ((v.due ?? "").trim() !== "" && due === null) return { ok: false, error: "Prazo inválido." };
  const buId = (v.buId ?? "") === "" ? null : v.buId;
  if (buId !== null && !isUuid(buId)) return { ok: false, error: "BU inválida." };
  return { ok: true, row: { type: cleanType(v.type), bu_id: buId, headline, action: cleanActionNote(v.action), owner: cleanOwner(v.owner), due_date: due, note: cleanActionNote(v.note) } };
}

/** Inclui um item novo no plano de ação da rodada. */
export async function createActionItem(segmentId: string, roundId: string, v: ItemInput): Promise<{ ok: true; item: RoundActionItemRow } | { ok: false; error: string }> {
  const { supabase } = await requireProfile();
  if (!isUuid(segmentId) || !isUuid(roundId)) return { ok: false, error: "Dados inválidos." };
  const r = itemRow(v);
  if (!r.ok) return r;
  const { data, error } = await supabase.from("round_action_items").insert({ segment_id: segmentId, round_id: roundId, ...r.row }).select("id,type,bu_id,headline,action,owner,due_date,note").single();
  if (error) return { ok: false, error: planFriendly(error) };
  return { ok: true, item: data as RoundActionItemRow };
}

/** Salva as mudanças de um item novo. */
export async function updateActionItem(id: string, v: ItemInput): Promise<SaveResult> {
  const { supabase } = await requireProfile();
  if (!isUuid(id)) return { ok: false, error: "Dados inválidos." };
  const r = itemRow(v);
  if (!r.ok) return r;
  const { data, error } = await supabase.from("round_action_items").update(r.row).eq("id", id).select("id");
  if (error) return { ok: false, error: planFriendly(error) };
  if (!data?.length) return { ok: false, error: PLAN_BLOCKED };
  return done();
}

/** Remove um item novo. */
export async function deleteActionItem(id: string): Promise<SaveResult> {
  const { supabase } = await requireProfile();
  if (!isUuid(id)) return { ok: false, error: "Dados inválidos." };
  const { data, error } = await supabase.from("round_action_items").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: planFriendly(error) };
  if (!data?.length) return { ok: false, error: PLAN_BLOCKED };
  return done();
}

/** Anotações da rodada do segmento. */
export async function saveRoundNotes(segmentId: string, roundId: string, notes: string): Promise<SaveResult> {
  const { supabase } = await requireProfile();
  if (!isUuid(segmentId) || !isUuid(roundId)) return { ok: false, error: "Dados inválidos." };
  const { data, error } = await supabase.from("round_notes").upsert({ segment_id: segmentId, round_id: roundId, notes: cleanText(notes) }, { onConflict: "segment_id,round_id" }).select("segment_id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return { ok: false, error: BLOCKED };
  return done();
}

/** Parte do rascunho que o líder já tinha: copia o nível das ofertas da rodada que ainda não têm decisão. */
export async function copyLeaderDraft(fd: FormData) {
  const segmentId = String(fd.get("segment_id")), roundId = String(fd.get("round_id"));
  const back = `/reuniao/${segmentId}/rodada/${roundId}`;
  const { supabase } = await requireProfile();
  if (!isUuid(segmentId) || !isUuid(roundId)) flash("/segmento", "erro", "Dados inválidos.");
  const [round, buRows, draft, cur] = await Promise.all([
    supabase.from("meeting_rounds").select("foco_limit").eq("id", roundId).maybeSingle(),
    supabase.from("meeting_round_bus").select("bu_id").eq("round_id", roundId),
    supabase.from("segment_priorities").select("offer_id,level").eq("segment_id", segmentId),
    supabase.from("round_priorities").select("offer_id,level").eq("segment_id", segmentId).eq("round_id", roundId),
  ]);
  if (!round.data) flash(back, "erro", "Rodada não encontrada.");
  const buIds = (buRows.data ?? []).map((b) => b.bu_id as string);
  const { data: offers } = buIds.length ? await supabase.from("offers").select("id").in("bu_id", buIds) : { data: [] };
  const inRound = new Set((offers ?? []).map((o) => o.id as string));
  const plan = planDraftCopy(
    new Map((draft.data ?? []).map((r) => [r.offer_id as string, r.level as Level])),
    new Map((cur.data ?? []).map((r) => [r.offer_id as string, r.level as Level])),
    inRound, (round.data?.foco_limit as number | undefined) ?? 5,
  );
  if (plan.length === 0) flash(back, "ok", "Não há nada a copiar: o rascunho do líder não tem ofertas novas nesta rodada.");
  const { error } = await supabase.from("round_priorities").upsert(plan.map((p) => ({ segment_id: segmentId, offer_id: p.offerId, level: p.level })), { onConflict: "segment_id,offer_id" });
  if (error) flash(back, "erro", friendly(error));
  revalidatePath(back);
  flash(back, "ok", `${plan.length} ${plan.length === 1 ? "oferta copiada" : "ofertas copiadas"} do rascunho. Ajuste o que quiser.`);
}

/** Diretoria: nome, contexto e limite de cada rodada, e a rodada de cada BU. */
export async function saveRounds(fd: FormData) {
  const back = "/admin/rodadas";
  const { supabase } = await requireProfile("admin");
  const rounds = await supabase.from("meeting_rounds").select("id,name");
  const bus = await supabase.from("bus").select("id");
  const ids = new Set((rounds.data ?? []).map((r) => r.id as string));
  for (const r of rounds.data ?? []) {
    const id = r.id as string;
    const name = String(fd.get(`name_${id}`) ?? "").trim().slice(0, 80);
    const limit = cleanLimit(fd.get(`limit_${id}`));
    if (!name) flash(back, "erro", "Toda rodada precisa de um nome.");
    if (limit === null) flash(back, "erro", `O limite de Foco de "${name}" deve ser um número de 1 a 50.`);
    const { error } = await supabase.from("meeting_rounds").update({ name, foco_limit: limit, ...(fd.has(`context_${id}`) ? { context: cleanContext(fd.get(`context_${id}`)) } : {}), updated_at: new Date().toISOString() }).eq("id", id);
    if (error) flash(back, "erro", error.message);
  }
  for (const b of bus.data ?? []) {
    const buId = b.id as string;
    const to = String(fd.get(`bu_${buId}`) ?? "");
    if (to === "" || !ids.has(to)) {
      const { error } = await supabase.from("meeting_round_bus").delete().eq("bu_id", buId);
      if (error) flash(back, "erro", error.message);
    } else {
      const { error } = await supabase.from("meeting_round_bus").upsert({ bu_id: buId, round_id: to }, { onConflict: "bu_id" });
      if (error) flash(back, "erro", error.message);
    }
  }
  revalidatePath(back);
  flash(back, "ok", "Rodadas salvas.");
}

/** Diretoria: cria ou atualiza uma tela de contexto da rodada. O conteúdo (JSON) é conferido pelo mesmo validador do carregador. */
export async function saveContextBlock(fd: FormData) {
  const back = "/admin/rodadas/contexto";
  const { supabase } = await requireProfile("admin");
  const id = String(fd.get("id") ?? "");
  const roundId = String(fd.get("round_id") ?? "");
  const kind = String(fd.get("kind") ?? "");
  const title = cleanTitle(fd.get("title"));
  const seg = String(fd.get("segment_id") ?? "");
  const position = Number(String(fd.get("position") ?? "0"));
  if (!isUuid(roundId)) flash(back, "erro", "Rodada inválida.");
  if (!isBlockKind(kind)) flash(back, "erro", "Tipo inválido.");
  if (!title) flash(back, "erro", "Dê um título à tela.");
  if (seg !== "" && !isUuid(seg)) flash(back, "erro", "Segmento inválido.");
  if (!Number.isInteger(position) || position < -1000 || position > 100000) flash(back, "erro", "A posição deve ser um número inteiro.");
  let json: unknown;
  try { json = JSON.parse(String(fd.get("body") ?? "")); } catch { flash(back, "erro", `"${title}": o conteúdo não é um JSON válido.`); }
  const parsed = parseBody(kind as BlockKind, json);
  if (!parsed.ok) flash(back, "erro", `"${title}": ${parsed.error}`);
  const row = {
    round_id: roundId, segment_id: seg === "" ? null : seg, position, kind, title, subtitle: cleanShort(fd.get("subtitle"), 300),
    body: parsed.ok ? parsed.body : {}, source: cleanShort(fd.get("source"), 800), note: cleanShort(fd.get("note"), 1200),
  };
  const res = id === "" ? await supabase.from("round_context_blocks").insert(row) : await supabase.from("round_context_blocks").update(row).eq("id", id);
  if (res.error) flash(back, "erro", res.error.message);
  revalidatePath(back);
  flash(back, "ok", id === "" ? `"${title}" criada.` : `"${title}" salva.`);
}

export async function deleteContextBlock(fd: FormData) {
  const back = "/admin/rodadas/contexto";
  const { supabase } = await requireProfile("admin");
  const id = String(fd.get("id") ?? "");
  if (!isUuid(id)) flash(back, "erro", "Tela inválida.");
  const { error } = await supabase.from("round_context_blocks").delete().eq("id", id);
  if (error) flash(back, "erro", error.message);
  revalidatePath(back);
  flash(back, "ok", "Tela removida.");
}
