"use server";

import { revalidatePath } from "next/cache";
import { requireBuAccess } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { flash } from "@/lib/flash";
import { buildPreview, parseOffersWorkbook, type ImportPreviewRow } from "@/lib/import-offers";
import { normalizeOfferType, normalizeRevenueModel, planActiveChange, sanitizeOfferPatch, type OfferPatchInput } from "@/lib/offers";
import { sanitizePitch, type PitchInput } from "@/lib/pitch";

const FRIENDLY_BLOCK = "Edição bloqueada: o período está fechado ou o envio já foi concluído.";
function friendly(err: { code?: string; message: string }) {
  return err.code === "42501" || /row-level security/i.test(err.message) ? FRIENDLY_BLOCK : `Não foi possível salvar: ${err.message}`;
}
const text = (v: unknown, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");
const txtOrNull = (v: unknown, max = 4000) => text(v, max).trim() || null;
const noteOrNull = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);

export type SaveResult = { ok: true; savedAt: string } | { ok: false; error: string };

/* ---------- Avaliação (autosave) ---------- */
export async function saveEvaluation(input: {
  offerId: string; segmentId: string; notApplicable: boolean; notes: (number | null)[]; evidence: string[];
}): Promise<SaveResult> {
  const { supabase, profile } = await requireProfile("admin", "head");
  const { data: offer } = await supabase.from("offers").select("id,bu_id").eq("id", input.offerId).maybeSingle();
  if (!offer) return { ok: false, error: "Oferta não encontrada." };
  const n = input.notes ?? [];
  const e = input.evidence ?? [];
  const row = {
    offer_id: offer.id, segment_id: input.segmentId, bu_id: offer.bu_id,
    not_applicable: !!input.notApplicable,
    n1: noteOrNull(n[0]), n2: noteOrNull(n[1]), n3: noteOrNull(n[2]), n4: noteOrNull(n[3]), n5: noteOrNull(n[4]),
    e1: txtOrNull(e[0]), e2: txtOrNull(e[1]), e3: txtOrNull(e[2]), e4: txtOrNull(e[3]), e5: txtOrNull(e[4]),
    updated_by: profile.id,
  };
  const { error } = await supabase.from("evaluations").upsert(row, { onConflict: "offer_id,segment_id" });
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true, savedAt: new Date().toISOString() };
}

/* ---------- Pitch (autosave) ---------- */
/** Pitch de uma oferta (ou agrupamento) em um segmento. A BU vem da oferta; o banco recusa oferta dentro de agrupamento. */
export async function savePitch(input: { offerId: string; segmentId: string; values: PitchInput }): Promise<SaveResult> {
  const { supabase, profile } = await requireProfile("admin", "head");
  const { data: offer } = await supabase.from("offers").select("id,bu_id").eq("id", input.offerId).maybeSingle();
  if (!offer) return { ok: false, error: "Oferta não encontrada." };
  const row = { offer_id: offer.id, bu_id: offer.bu_id, segment_id: input.segmentId, updated_by: profile.id, ...sanitizePitch(input.values ?? {}) };
  const { error } = await supabase.from("pitches").upsert(row, { onConflict: "offer_id,segment_id" });
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true, savedAt: new Date().toISOString() };
}

/* ---------- Ticket médio da BU ---------- */
export async function setBuTicket(fd: FormData) {
  const code = String(fd.get("code"));
  const { supabase, bu } = await requireBuAccess(code);
  const raw = String(fd.get("ticket") ?? "").replace(/\./g, "").replace(",", ".");
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) flash(`/bu/${code}`, "erro", "Informe um ticket médio válido.");
  const { error } = await supabase.from("bu_ticket").upsert({ bu_id: bu.id, ticket_medio: value, updated_at: new Date().toISOString() }, { onConflict: "bu_id" });
  if (error) flash(`/bu/${code}`, "erro", friendly(error));
  revalidatePath(`/bu/${code}`);
  flash(`/bu/${code}`, "ok", "Ticket médio da BU salvo.");
}

/* ---------- Ofertas ---------- */
function offerFields(fd: FormData) {
  const t = String(fd.get("ticket_medio") ?? "").trim();
  const ticket = t === "" ? null : Number(t.replace(/\./g, "").replace(",", "."));
  // Tipo e modelo só aceitam a lista padronizada (o banco também recusa qualquer outro valor).
  const type = normalizeOfferType(txtOrNull(fd.get("offer_type"), 100));
  const model = normalizeRevenueModel(txtOrNull(fd.get("revenue_model"), 100));
  return {
    name: text(fd.get("name"), 200).trim(),
    description: txtOrNull(fd.get("description"), 1000),
    offer_type: type.value,
    revenue_model: model.value,
    ticket_medio: ticket != null && Number.isFinite(ticket) && ticket >= 0 ? ticket : null,
    bcg: txtOrNull(fd.get("bcg"), 40),
  };
}

/** Caminho de retorno informado pelo formulário, aceito só se ficar dentro da BU. */
const safeBack = (v: FormDataEntryValue | null, code: string) => {
  const s = typeof v === "string" ? v : "";
  return s.startsWith(`/bu/${code}/`) && !s.includes("//") && !s.includes("..") ? s : null;
};

export async function saveOffer(fd: FormData) {
  const routeCode = String(fd.get("code"));
  const id = String(fd.get("id") ?? "");
  const { bu: routeBu, config } = await requireBuAccess(routeCode);

  // BU escolhida no cadastro novo (lista das BUs cadastradas). Autoriza pela BU de destino: head só cadastra nas suas.
  let bu = routeBu;
  const chosen = String(fd.get("bu_id") ?? "");
  if (!id && chosen && chosen !== routeBu.id) {
    const target = config.bus.find((b) => b.id === chosen);
    if (!target) flash(`/bu/${routeCode}/ofertas/nova`, "erro", "BU inválida.");
    bu = (await requireBuAccess(target!.code)).bu;
  }
  const { supabase } = await requireBuAccess(bu.code);

  const fields = offerFields(fd);
  const code = bu.code;
  const back = safeBack(fd.get("back"), code);
  const form = id ? (back ?? `/bu/${code}/ofertas/${id}`) : `/bu/${routeCode}/ofertas/nova`; // erros voltam ao formulário
  if (!fields.name) flash(form, "erro", "Informe o nome da oferta.");
  if (!fields.offer_type || !fields.revenue_model) flash(form, "erro", "Escolha o tipo e o modelo de receita da oferta.");
  const { error } = id
    ? await supabase.from("offers").update(fields).eq("id", id).eq("bu_id", bu.id)
    : await supabase.from("offers").insert({ ...fields, bu_id: bu.id });
  if (error) flash(form, "erro", error.code === "23505" ? "Já existe uma oferta com esse nome nesta BU." : friendly(error));
  revalidatePath(`/bu/${code}`, "layout");
  // Cadastro novo volta para a lista; edição continua no detalhe.
  flash(id ? form : `/bu/${code}/ofertas`, "ok", id ? "Oferta atualizada." : "Oferta cadastrada.");
}

export async function toggleOffer(fd: FormData) {
  const code = String(fd.get("code"));
  const id = String(fd.get("id"));
  const { supabase, bu } = await requireBuAccess(code);
  const back = `/bu/${code}/ofertas/${id}`;
  const active = String(fd.get("active")) === "true";
  const { error } = await supabase.from("offers").update({ active }).eq("id", id).eq("bu_id", bu.id);
  if (error) flash(back, "erro", friendly(error));
  revalidatePath(`/bu/${code}`, "layout");
  flash(back, "ok", active ? "Oferta reconsiderada: volta para as próximas etapas." : "Oferta desconsiderada: não segue para as próximas etapas.");
}

/* ---------- Importação do template Excel ---------- */
export type ImportState =
  | { step: "idle" }
  | { step: "error"; message: string }
  | { step: "preview"; rows: ImportPreviewRow[]; fileName: string }
  | { step: "done"; inserted: number; skipped: number };

const MAX_FILE = 4 * 1024 * 1024; // a Vercel limita o corpo da requisição a 4,5 MB

export async function previewImport(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const { supabase, bu } = await requireBuAccess(String(fd.get("code")));
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { step: "error", message: "Selecione o arquivo .xlsx." };
  if (file.size > MAX_FILE) return { step: "error", message: "Arquivo maior que 4 MB." };
  const { rows, error } = await parseOffersWorkbook(await file.arrayBuffer());
  if (error) return { step: "error", message: error };
  if (rows.length === 0) return { step: "error", message: "Nenhuma oferta encontrada a partir da linha 7." };
  const { data: existing } = await supabase.from("offers").select("name,code").eq("bu_id", bu.id);
  return { step: "preview", rows: buildPreview(rows, (existing ?? []).map((o) => o.name), (existing ?? []).map((o) => o.code ?? "")), fileName: file.name };
}

export async function confirmImport(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const { supabase, bu } = await requireBuAccess(String(fd.get("code")));
  let rows: ImportPreviewRow[];
  try {
    rows = JSON.parse(String(fd.get("rows") ?? "[]"));
  } catch {
    return { step: "error", message: "Dados da prévia inválidos. Envie o arquivo novamente." };
  }
  // Não confiamos no cliente: refaz a checagem de duplicados contra o banco.
  const { data: existing } = await supabase.from("offers").select("name,code").eq("bu_id", bu.id);
  const preview = buildPreview(
    rows.slice(0, 500).map((r) => ({
      line: Number(r.line) || 0,
      code: txtOrNull(r.code, 40),
      name: text(r.name, 200).trim(),
      description: txtOrNull(r.description, 1000),
      offer_type: txtOrNull(r.offer_type, 100),
      revenue_model: txtOrNull(r.revenue_model, 100),
      ticket_medio: typeof r.ticket_medio === "number" && r.ticket_medio >= 0 ? r.ticket_medio : null,
    })).filter((r) => r.name),
    (existing ?? []).map((o) => o.name),
    (existing ?? []).map((o) => o.code ?? ""),
  );
  const valid = preview.filter((r) => !r.issue);
  if (valid.length) {
    const toRow = (r: (typeof valid)[number]) => ({ bu_id: bu.id, code: r.code, name: r.name, description: r.description, offer_type: r.offer_type, revenue_model: r.revenue_model, ticket_medio: r.ticket_medio });
    // Com ID informado, o lote entra de uma vez. Sem ID, o banco numera olhando as ofertas já gravadas:
    // num único insert as linhas não se enxergam e repetiriam o número, então entram uma a uma, na ordem da planilha.
    const withCode = valid.filter((r) => r.code);
    if (withCode.length) {
      const { error } = await supabase.from("offers").insert(withCode.map(toRow));
      if (error) return { step: "error", message: friendly(error) };
    }
    for (const r of valid.filter((x) => !x.code)) {
      const { error } = await supabase.from("offers").insert(toRow(r));
      if (error) return { step: "error", message: friendly(error) };
    }
  }
  revalidatePath(`/bu/${bu.code}`, "layout");
  return { step: "done", inserted: valid.length, skipped: preview.length - valid.length };
}

/* ---------- Envio ---------- */
export async function submitBu(fd: FormData) {
  const code = String(fd.get("code"));
  const { supabase, bu } = await requireBuAccess(code);
  const { error } = await supabase.rpc("submit_bu", { p_bu: bu.id });
  if (error) flash(`/bu/${code}`, "erro", error.message);
  revalidatePath(`/bu/${code}`, "layout");
  flash(`/bu/${code}`, "ok", "Envio concluído. A BU está em modo somente leitura.");
}

/* ---------- Edição na tabela da etapa 1 ---------- */
/** Edita tipo, modelo e/ou ticket de uma oferta direto na linha da tabela (salva sozinho). */
export async function saveOfferInline(input: { id: string; patch: OfferPatchInput }): Promise<SaveResult> {
  const { supabase } = await requireProfile("admin", "head");
  const r = sanitizeOfferPatch(input.patch ?? {});
  if (!r.ok) return { ok: false, error: r.error };
  const { data, error } = await supabase.from("offers").update(r.patch).eq("id", String(input.id)).select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return { ok: false, error: "Edição bloqueada: o período está fechado, o envio já foi concluído ou a oferta não é sua." };
  return { ok: true, savedAt: new Date().toISOString() };
}

/** Aplica tipo e/ou modelo a várias ofertas de uma vez (ex.: todas as “Capacitação – …”). */
export async function bulkSetOffers(input: { ids: string[]; offer_type?: string; revenue_model?: string }): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const { supabase } = await requireProfile("admin", "head");
  const ids = [...new Set((input.ids ?? []).filter((x) => typeof x === "string"))].slice(0, 500);
  if (ids.length === 0) return { ok: false, error: "Selecione ao menos uma oferta." };
  const raw: OfferPatchInput = {};
  if (input.offer_type) raw.offer_type = input.offer_type;
  if (input.revenue_model) raw.revenue_model = input.revenue_model;
  const r = sanitizeOfferPatch(raw);
  if (!r.ok) return { ok: false, error: r.error === "Nada para alterar." ? "Escolha o tipo e/ou o modelo para aplicar." : r.error };
  const { data, error } = await supabase.from("offers").update(r.patch).in("id", ids).select("id");
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true, count: data?.length ?? 0 };
}

/**
 * Desconsidera (active=false) ou reconsidera (active=true) ofertas direto na tabela da etapa 1.
 * Nada é apagado: a oferta só sai das próximas etapas (agrupamento, classificação, envio) e pode voltar.
 */
export async function setOffersActive(input: { ids: string[]; active: boolean }): Promise<{ ok: true; count: number; skipped: number; note: string | null } | { ok: false; error: string }> {
  const { supabase } = await requireProfile("admin", "head");
  const ids = [...new Set((input.ids ?? []).filter((x) => typeof x === "string"))].slice(0, 500);
  if (ids.length === 0) return { ok: false, error: "Selecione ao menos uma oferta." };
  const active = input.active === true;
  const { data: rows, error: e1 } = await supabase.from("offers").select("id,bu_id,active,is_group,group_id,offer_type,revenue_model").in("id", ids);
  if (e1) return { ok: false, error: friendly(e1) };
  if (!rows?.length) return { ok: false, error: "Edição bloqueada: a oferta não é sua." };
  const buIds = [...new Set(rows.map((r) => r.bu_id as string))];
  const { data: prog } = await supabase.from("bu_progress").select("bu_id,offers_confirmed_at").in("bu_id", buIds);
  const confirmed = new Set((prog ?? []).filter((p) => p.offers_confirmed_at).map((p) => p.bu_id as string));
  // a regra "etapa 1 já confirmada" vale por BU
  const final: string[] = [];
  const skipped: { reason: string }[] = [];
  for (const bu of buIds) {
    const p = planActiveChange(rows.filter((r) => r.bu_id === bu), active, confirmed.has(bu));
    final.push(...p.ids);
    skipped.push(...p.skipped);
  }
  if (final.length) {
    const { data, error } = await supabase.from("offers").update({ active }).in("id", final).select("id");
    if (error) return { ok: false, error: friendly(error) };
    if ((data?.length ?? 0) === 0) return { ok: false, error: "Edição bloqueada: o período está fechado ou o envio já foi concluído." };
  }
  const nGroup = skipped.filter((s) => s.reason === "grupo" || s.reason === "membro").length;
  const nIncomplete = skipped.filter((s) => s.reason === "incompleta").length;
  const nSame = rows.length - final.length - skipped.length;
  const notes = [
    nSame ? `${nSame} já ${nSame === 1 ? "estava" : "estavam"} ${active ? "considerada" : "desconsiderada"}${nSame === 1 ? "" : "s"}` : "",
    nGroup ? `${nGroup} já ${nGroup === 1 ? "está" : "estão"} em agrupamento (desfaça o agrupamento antes)` : "",
    nIncomplete ? `${nIncomplete} sem tipo ou modelo (preencha antes, a lista já foi confirmada)` : "",
  ].filter(Boolean);
  return { ok: true, count: final.length, skipped: skipped.length, note: notes.length ? notes.join("; ") + "." : null };
}

/* ---------- Etapas da BU: 1) conferir ofertas → 2) agrupar → 3) classificar ---------- */
const rpcMessage = (e: { code?: string; message: string }) => (e.code === "23505" ? "Já existe uma oferta com esse nome nesta BU." : e.message);

export async function confirmStep(fd: FormData) {
  const code = String(fd.get("code"));
  const step = String(fd.get("step"));
  const done = String(fd.get("done")) === "true";
  const { supabase, bu } = await requireBuAccess(code);
  const here = step === "offers" ? `/bu/${code}/ofertas` : `/bu/${code}/agrupamento`;
  const { error } = await supabase.rpc("set_bu_step", { p_bu: bu.id, p_step: step, p_done: done });
  if (error) flash(here, "erro", error.message);
  revalidatePath(`/bu/${code}`, "layout");
  if (!done) flash(here, "ok", step === "offers" ? "Etapa reaberta: confira as ofertas e confirme de novo para seguir." : "Agrupamento reaberto: a classificação fica bloqueada até você concluir de novo.");
  flash(step === "offers" ? `/bu/${code}/agrupamento` : `/bu/${code}`, "ok", step === "offers" ? "Lista de ofertas confirmada. Agora agrupe as ofertas semelhantes." : "Agrupamento concluído. Agora você pode classificar.");
}

/* ---------- Agrupamento ---------- */
export async function createGroup(fd: FormData) {
  const code = String(fd.get("code"));
  const ids = fd.getAll("ids").map(String);
  const { supabase, bu } = await requireBuAccess(code);
  const back = `/bu/${code}/agrupamento/novo?${ids.map((i) => `ids=${encodeURIComponent(i)}`).join("&")}`;
  const f = offerFields(fd);
  if (!f.name) flash(back, "erro", "Informe o nome do agrupamento.");
  if (!f.offer_type || !f.revenue_model) flash(back, "erro", "Escolha o tipo e o modelo de receita do agrupamento.");
  const { error } = await supabase.rpc("create_offer_group", {
    p_bu: bu.id, p_name: f.name, p_type: f.offer_type, p_model: f.revenue_model, p_ticket: f.ticket_medio, p_description: f.description, p_members: ids,
  });
  if (error) flash(back, "erro", rpcMessage(error));
  revalidatePath(`/bu/${code}`, "layout");
  flash(`/bu/${code}/agrupamento`, "ok", `Agrupamento “${f.name}” criado com ${ids.length} ofertas.`);
}

export async function addToGroup(fd: FormData) {
  const code = String(fd.get("code"));
  const ids = fd.getAll("ids").map(String);
  const { supabase } = await requireBuAccess(code);
  const back = `/bu/${code}/agrupamento`;
  const { error } = await supabase.rpc("add_to_offer_group", { p_group: String(fd.get("group_id")), p_members: ids });
  if (error) flash(back, "erro", rpcMessage(error));
  revalidatePath(`/bu/${code}`, "layout");
  flash(back, "ok", `${ids.length} ${ids.length === 1 ? "oferta adicionada" : "ofertas adicionadas"} ao agrupamento.`);
}

export async function removeFromGroup(fd: FormData) {
  const code = String(fd.get("code"));
  const groupId = String(fd.get("group_id"));
  const { supabase } = await requireBuAccess(code);
  const back = `/bu/${code}/agrupamento/${groupId}`;
  const { error } = await supabase.rpc("remove_from_offer_group", { p_offer: String(fd.get("offer_id")) });
  if (error) flash(back, "erro", rpcMessage(error));
  revalidatePath(`/bu/${code}`, "layout");
  flash(back, "ok", "Oferta removida do agrupamento.");
}

export async function dissolveGroup(fd: FormData) {
  const code = String(fd.get("code"));
  const groupId = String(fd.get("group_id"));
  const { supabase } = await requireBuAccess(code);
  const { error } = await supabase.rpc("dissolve_offer_group", { p_group: groupId });
  if (error) flash(`/bu/${code}/agrupamento/${groupId}`, "erro", rpcMessage(error));
  revalidatePath(`/bu/${code}`, "layout");
  flash(`/bu/${code}/agrupamento`, "ok", "Agrupamento desfeito: as ofertas voltaram a ser avulsas.");
}
