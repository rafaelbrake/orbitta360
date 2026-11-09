"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { flash } from "@/lib/flash";
import { SITE_URL } from "@/lib/env";
import { weightsSum } from "@/lib/scoring";

const s = (fd: FormData, k: string, max = 300) => String(fd.get(k) ?? "").trim().slice(0, max);
const ROLES = ["admin", "head", "diretor"];

async function replaceLinks(
  supabase: Awaited<ReturnType<typeof requireProfile>>["supabase"], userId: string, role: string, bus: string[], segs: string[],
) {
  // Só head tem BU; só diretor tem segmentos (regional/segmentos atribuídos).
  const buIds = role === "head" ? bus : [];
  const segIds = role === "diretor" ? segs : [];
  await supabase.from("user_bus").delete().eq("user_id", userId);
  await supabase.from("user_segments").delete().eq("user_id", userId);
  if (buIds.length) await supabase.from("user_bus").insert(buIds.map((bu_id) => ({ user_id: userId, bu_id })));
  if (segIds.length) await supabase.from("user_segments").insert(segIds.map((segment_id) => ({ user_id: userId, segment_id })));
}

/* ---------- Usuários ---------- */
export async function inviteUser(fd: FormData) {
  await requireProfile("admin");
  const back = "/admin/usuarios/novo"; // erros voltam ao formulário; sucesso vai para a lista
  const email = s(fd, "email").toLowerCase();
  const role = s(fd, "role");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) flash(back, "erro", "E-mail inválido.");
  if (!ROLES.includes(role)) flash(back, "erro", "Perfil inválido.");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: s(fd, "full_name", 120) },
    redirectTo: `${SITE_URL}/auth/confirm?next=/definir-senha`,
  });
  if (error || !data.user) flash(back, "erro", `Não foi possível convidar: ${error?.message ?? "erro desconhecido"}`);

  const id = data.user!.id;
  const { error: pErr } = await admin.from("profiles").upsert({
    id, email, full_name: s(fd, "full_name", 120) || null, role,
    regional: s(fd, "regional", 80) || null, active: true, can_see_bu_detail: fd.get("can_see_bu_detail") === "on",
  });
  if (pErr) flash(back, "erro", `Convite enviado, mas o perfil falhou: ${pErr.message}`);

  const buIds = role === "head" ? fd.getAll("bus").map(String) : [];
  const segIds = role === "diretor" ? fd.getAll("segments").map(String) : [];
  if (buIds.length) await admin.from("user_bus").insert(buIds.map((bu_id) => ({ user_id: id, bu_id })));
  if (segIds.length) await admin.from("user_segments").insert(segIds.map((segment_id) => ({ user_id: id, segment_id })));

  revalidatePath("/admin/usuarios");
  flash("/admin/usuarios", "ok", `Convite enviado para ${email}.`);
}

export async function updateUser(fd: FormData) {
  const { supabase, profile } = await requireProfile("admin");
  const id = s(fd, "id");
  const back = `/admin/usuarios/${id}`; // continua na tela de detalhe depois de salvar
  const role = s(fd, "role");
  const active = fd.get("active") === "on";
  if (!ROLES.includes(role)) flash(back, "erro", "Perfil inválido.");
  if (id === profile.id && (role !== "admin" || !active)) flash(back, "erro", "Você não pode rebaixar nem desativar o próprio acesso de administrador.");

  const { error } = await supabase.from("profiles").update({
    full_name: s(fd, "full_name", 120) || null, role, regional: s(fd, "regional", 80) || null, active,
    can_see_bu_detail: fd.get("can_see_bu_detail") === "on",
  }).eq("id", id);
  if (error) flash(back, "erro", error.message);
  await replaceLinks(supabase, id, role, fd.getAll("bus").map(String), fd.getAll("segments").map(String));
  revalidatePath("/admin/usuarios", "layout");
  flash(back, "ok", "Usuário atualizado.");
}

/* ---------- Critérios (pesos e rubricas) ---------- */
export async function saveCriteria(fd: FormData) {
  const { supabase } = await requireProfile("admin");
  const back = "/admin/config";
  const items = [1, 2, 3, 4, 5].map((i) => ({
    id: i,
    name: s(fd, `name_${i}`, 120),
    question: s(fd, `question_${i}`, 400),
    weight: Number(s(fd, `weight_${i}`).replace(",", ".")),
    rubric: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [String(n), s(fd, `rubric_${i}_${n}`, 600)])),
  }));
  if (items.some((i) => !Number.isFinite(i.weight) || i.weight < 0)) flash(back, "erro", "Pesos inválidos.");
  const sum = weightsSum(items.map((i) => i.weight));
  if (sum !== 100) flash(back, "erro", `Os pesos precisam somar 100 (soma atual: ${sum}).`);
  const { error } = await supabase.rpc("save_criteria", { p_items: items });
  if (error) flash(back, "erro", error.message);
  revalidatePath("/", "layout");
  flash(back, "ok", "Critérios salvos. Scores e classificações foram recalculados em todas as telas.");
}

/* ---------- Faixas ---------- */
export async function saveBands(fd: FormData) {
  const { supabase } = await requireProfile("admin");
  const back = "/admin/config";
  const bands = [1, 2, 3, 4].map((id) => ({
    id, label: s(fd, `label_${id}`, 80), direction: s(fd, `direction_${id}`, 200),
    min_score: Number(s(fd, `min_${id}`)), max_score: Number(s(fd, `max_${id}`)),
  }));
  if (bands.some((b) => !Number.isInteger(b.min_score) || !Number.isInteger(b.max_score) || b.min_score > b.max_score || b.min_score < 0 || b.max_score > 100))
    flash(back, "erro", "Faixas inválidas: use inteiros de 0 a 100, com mínimo ≤ máximo.");
  const sorted = [...bands].sort((a, b) => b.min_score - a.min_score);
  for (let i = 1; i < sorted.length; i++)
    if (sorted[i].max_score >= sorted[i - 1].min_score) flash(back, "erro", "As faixas não podem se sobrepor.");
  for (const b of bands) {
    const { error } = await supabase.from("class_bands").update({ label: b.label, direction: b.direction, min_score: b.min_score, max_score: b.max_score }).eq("id", b.id);
    if (error) flash(back, "erro", error.message);
  }
  revalidatePath("/", "layout");
  flash(back, "ok", "Faixas salvas. Classificações recalculadas.");
}

/* ---------- Parâmetros gerais ---------- */
export async function saveSettings(fd: FormData) {
  const { supabase } = await requireProfile("admin");
  const back = "/admin/config";
  const step = Number(s(fd, "ticket_step").replace(",", ".")) / 100;
  if (!(step > 0 && step <= 1)) flash(back, "erro", "O passo do ticket deve estar entre 1% e 100%.");
  const date = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s(fd, k)) ? s(fd, k) : ""); // "" = sem prazo (jsonb não aceita null aqui)
  const rows = [
    { key: "period_open", value: fd.get("period_open") === "on" },
    { key: "ticket_step", value: step },
    // prazo de cada onda de entrega dos heads; o prazo geral é o da última onda (calculado ao carregar)
    ...[...fd.keys()].filter((k) => k.startsWith("deadline_wave:")).map((k) => ({ key: k.slice(0, 80), value: date(k) })),
    { key: "deadline_directors", value: date("deadline_directors") },
  ];
  const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
  if (error) flash(back, "erro", error.message);
  revalidatePath("/", "layout");
  flash(back, "ok", "Parâmetros salvos.");
}

/* ---------- Segmentos e BUs (cadastros) ---------- */
export async function saveSegment(fd: FormData) {
  const { supabase } = await requireProfile("admin");
  const id = s(fd, "id");
  const form = id ? `/admin/segmentos/${id}` : "/admin/segmentos/novo"; // erros voltam ao formulário
  const leaderIds = fd.getAll("leaders").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const setLeaders = fd.get("leaders_present") === "1"; // o formulário traz a seleção de líderes
  let leaderText: string | null | undefined;
  if (setLeaders) {
    const { data: ppl } = leaderIds.length ? await supabase.from("profiles").select("full_name,email").in("id", leaderIds) : { data: [] };
    leaderText = (ppl ?? []).map((p) => p.full_name || p.email).join(" e ") || null; // texto usado nas telas que só mostram o nome
  }
  const row = { name: s(fd, "name", 100), wave: s(fd, "wave", 20) || "2027/I", ...(leaderText !== undefined ? { leader: leaderText } : {}), active: fd.get("active") === "on", sort: Number(s(fd, "sort")) || 0 };
  if (!row.name) flash(form, "erro", "Informe o nome do segmento.");
  const saved = id ? await supabase.from("segments").update(row).eq("id", id).select("id").single() : await supabase.from("segments").insert(row).select("id").single();
  if (saved.error) flash(form, "erro", saved.error.code === "23505" ? "Já existe segmento com esse nome." : saved.error.message);
  if (setLeaders && saved.data) {
    const segId = saved.data.id as string;
    const del = await supabase.from("segment_leaders").delete().eq("segment_id", segId);
    if (del.error) flash(form, "erro", `Segmento salvo, mas não consegui atualizar os líderes: ${del.error.message}`);
    if (leaderIds.length) {
      const ins = await supabase.from("segment_leaders").insert(leaderIds.map((user_id) => ({ segment_id: segId, user_id })));
      if (ins.error) flash(form, "erro", `Segmento salvo, mas não consegui atualizar os líderes: ${ins.error.message}`);
    }
  }
  // Limite de ofertas em Foco da consolidação (só quando o valor mudou)
  const limit = Number(s(fd, "foco_limit")), prev = Number(s(fd, "foco_limit_prev"));
  if (id && fd.get("foco_limit") !== null && limit !== prev) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) flash(form, "erro", "Segmento salvo, mas o máximo de Foco deve ser um número de 1 a 50.");
    const r = await supabase.rpc("set_foco_limit", { p_segment: id, p_limit: limit });
    if (r.error) flash(form, "erro", `Segmento salvo, mas não consegui mudar o limite de Foco: ${r.error.message}`);
  }
  revalidatePath("/", "layout");
  flash(id ? form : "/admin/segmentos", "ok", id ? "Segmento atualizado." : "Segmento cadastrado.");
}

export async function saveBu(fd: FormData) {
  const { supabase } = await requireProfile("admin");
  const id = s(fd, "id");
  const form = id ? `/admin/bus/${id}` : "/admin/bus/novo";
  const row = { code: s(fd, "code", 10).toUpperCase(), name: s(fd, "name", 100), active: fd.get("active") === "on", sort: Number(s(fd, "sort")) || 0 };
  if (!row.code || !row.name) flash(form, "erro", "Informe sigla e nome da BU.");
  const { error } = id ? await supabase.from("bus").update(row).eq("id", id) : await supabase.from("bus").insert(row);
  if (error) flash(form, "erro", error.code === "23505" ? "Já existe BU com essa sigla." : error.message);
  revalidatePath("/", "layout");
  flash(id ? form : "/admin/bus", "ok", id ? "BU atualizada." : "BU cadastrada.");
}

/* ---------- Reabrir envio ---------- */
export async function reopenBu(fd: FormData) {
  const { supabase } = await requireProfile("admin");
  const { error } = await supabase.rpc("reopen_bu", { p_bu: s(fd, "bu_id") });
  if (error) flash("/admin", "erro", error.message);
  revalidatePath("/", "layout");
  flash("/admin", "ok", "Envio reaberto: o head volta a poder editar.");
}

export async function reopenMmt(fd: FormData) {
  const { supabase } = await requireProfile("admin");
  const userId = String(fd.get("user_id") ?? "");
  const { error } = await supabase.rpc("reopen_mmt", { p_user: userId });
  if (error) flash("/admin", "erro", error.message);
  revalidatePath("/", "layout");
  flash("/admin", "ok", "Envio do diretor reaberto.");
}
