"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { flash } from "@/lib/flash";
import { AUDIENCES, MMT_TYPES, PRIORITIES } from "@/lib/mmt";
import { requireProfile } from "@/lib/session";
import { cleanViewText } from "@/lib/regional";
import type { MmtPriority, MmtType } from "@/lib/types";
import type { SaveResult } from "@/app/actions/bu";

const BLOCKED = "Edição bloqueada: o período está fechado ou o envio já foi concluído.";
const friendly = (err: { code?: string; message: string }) =>
  err.code === "42501" || /row-level security/i.test(err.message) ? BLOCKED : `Não foi possível salvar: ${err.message}`;
const txt = (v: unknown, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) || null : null);
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Cria o registro (rascunho) e abre a tela de edição. */
export async function createMmtRecord(fd: FormData) {
  const { supabase } = await requireProfile("diretor", "admin");
  const type = String(fd.get("type")) as MmtType;
  const segmentId = fd.get("segment_id");
  const buId = fd.get("bu_id");
  if (!MMT_TYPES.includes(type) || !isUuid(segmentId) || !isUuid(buId)) {
    flash("/diretor/registro/novo", "erro", "Escolha o tipo, o segmento e a BU para criar o registro.");
  }
  const { data, error } = await supabase
    .from("mmt_records")
    .insert({ type, segment_id: segmentId, bu_id: buId })
    .select("id")
    .single();
  if (error || !data) flash("/diretor/registro/novo", "erro", error ? friendly(error) : "Não foi possível criar o registro.");
  revalidatePath("/diretor");
  redirect(`/diretor/registro/${data.id}`);
}

export interface MmtValues {
  segment_id: string; bu_id: string; offer_id: string | null; priority: MmtPriority | null;
  headline: string; evidence: string; reason: string; action: string; indicator: string;
  audience: string | null; audience_other: string;
}

/** Autosave do registro. Tipo e autor nunca mudam; a regional vem do perfil (trigger no banco). */
export async function saveMmtRecord(id: string, v: MmtValues): Promise<SaveResult> {
  const { supabase } = await requireProfile("diretor", "admin");
  if (!isUuid(id) || !isUuid(v.segment_id) || !isUuid(v.bu_id)) return { ok: false, error: "Dados inválidos." };
  const row = {
    segment_id: v.segment_id,
    bu_id: v.bu_id,
    offer_id: isUuid(v.offer_id) ? v.offer_id : null,
    priority: v.priority && PRIORITIES.includes(v.priority) ? v.priority : null,
    headline: txt(v.headline), evidence: txt(v.evidence), reason: txt(v.reason), action: txt(v.action), indicator: txt(v.indicator),
    audience: v.audience && (AUDIENCES as readonly string[]).includes(v.audience) ? v.audience : null,
    audience_other: txt(v.audience_other, 200),
  };
  const { data, error } = await supabase.from("mmt_records").update(row).eq("id", id).select("id");
  if (error) {
    return { ok: false, error: /oferta escolhida/i.test(error.message) ? "A oferta escolhida não pertence à BU informada." : friendly(error) };
  }
  if (!data?.length) return { ok: false, error: BLOCKED };
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function deleteMmtRecord(fd: FormData) {
  const { supabase } = await requireProfile("diretor", "admin");
  const id = fd.get("id");
  if (!isUuid(id)) flash("/diretor", "erro", "Registro inválido.");
  const { data, error } = await supabase.from("mmt_records").delete().eq("id", id as string).select("id");
  if (error) flash("/diretor", "erro", friendly(error));
  if (!data?.length) flash("/diretor", "erro", BLOCKED);
  revalidatePath("/diretor");
  flash("/diretor", "ok", "Registro excluído.");
}

export async function submitMmt(fd?: FormData) {
  const { supabase } = await requireProfile("diretor");
  const raw = fd ? String(fd.get("back") ?? "") : "";
  const back = raw === "/diretor/regiao" ? raw : "/diretor"; // só volta para as telas do diretor
  const { error } = await supabase.rpc("submit_mmt");
  if (error) flash(back, "erro", error.message);
  revalidatePath("/diretor", "layout");
  flash(back, "ok", "Envio concluído. Sua visão e seus registros estão em modo somente leitura.");
}

/** Autosave da visão regional de um segmento (um recado por diretor e segmento). A regional vem do perfil (trigger). */
export async function saveRegionalView(segmentId: string, v: { works: string; not_works: string }): Promise<SaveResult> {
  const { supabase } = await requireProfile("diretor", "admin");
  if (!isUuid(segmentId)) return { ok: false, error: "Dados inválidos." };
  const { data, error } = await supabase
    .from("regional_views")
    .upsert({ segment_id: segmentId, works: cleanViewText(v.works), not_works: cleanViewText(v.not_works) }, { onConflict: "author_id,segment_id" })
    .select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return { ok: false, error: BLOCKED };
  return { ok: true, savedAt: new Date().toISOString() };
}

/** Ofertas ativas de uma BU (só nome/código), para o campo opcional "oferta". */
export async function listBuOffers(buId: string): Promise<{ id: string; code: string | null; name: string }[]> {
  const { supabase } = await requireProfile("diretor", "admin");
  if (!isUuid(buId)) return [];
  const { data } = await supabase.rpc("list_offers", { p_bu: buId });
  return (data ?? []) as { id: string; code: string | null; name: string }[];
}
