import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { daysUntil } from "@/lib/format";
import { requireProfile } from "@/lib/session";
import { isEvaluationDone } from "@/lib/scoring";
import type { Band } from "@/lib/scoring";
import { isScorable, nextOfferCode } from "@/lib/offers";
import { buildWaves, orderedSegments, overallDeadline, waveScope, type Wave } from "@/lib/waves";
import type { Bu, BuStage, Criterion, EvaluationScored, Offer, Segment, Submission } from "@/lib/types";

export interface Config {
  criteria: Criterion[];
  bands: (Band & { id: number })[];
  settings: { period_open: boolean; ticket_step: number; deadline_heads: string | null; deadline_directors: string | null; meeting_dates: string[] };
  segments: Segment[]; // todos
  activeSegments: Segment[]; // na ordem das ondas
  /** ondas de entrega dos heads (segmentos ativos agrupados, da entrega mais cedo para a mais tarde) */
  waves: Wave[];
  bus: Bu[];
}

export async function loadConfig(supabase: SupabaseClient): Promise<Config> {
  const [c, b, s, sg, bu] = await Promise.all([
    supabase.from("criteria").select("*").order("id"),
    supabase.from("class_bands").select("*").order("sort"),
    supabase.from("settings").select("key,value"),
    supabase.from("segments").select("*").order("sort"),
    supabase.from("bus").select("*").order("sort"),
  ]);
  const map = Object.fromEntries((s.data ?? []).map((r) => [r.key, r.value]));
  const segments = (sg.data ?? []) as Segment[];
  const waves = buildWaves(segments, map);
  return {
    criteria: (c.data ?? []).map((r) => ({ ...r, weight: Number(r.weight) })) as Criterion[],
    bands: (b.data ?? []) as Config["bands"],
    settings: {
      period_open: map.period_open ?? true,
      ticket_step: Number(map.ticket_step ?? 0.2),
      deadline_heads: overallDeadline(waves, map.deadline_heads || null), // o da última onda
      deadline_directors: map.deadline_directors || null,
      meeting_dates: map.meeting_dates ?? [],
    },
    segments,
    activeSegments: orderedSegments(waves),
    waves,
    bus: (bu.data ?? []) as Bu[],
  };
}

/** Acesso a uma BU pela sigla: admin ou head vinculado. Sem acesso → 404 (e o RLS barra de qualquer forma). */
export async function requireBuAccess(code: string) {
  const { supabase, profile } = await requireProfile("admin", "head");
  const { data: bu } = await supabase.from("bus").select("*").eq("code", code.toUpperCase()).maybeSingle<Bu>();
  if (!bu) notFound();
  if (profile.role === "head") {
    const { data: link } = await supabase.from("user_bus").select("bu_id").eq("user_id", profile.id).eq("bu_id", bu.id).maybeSingle();
    if (!link) notFound();
  }
  const [config, editable, sub, stage] = await Promise.all([
    loadConfig(supabase),
    supabase.rpc("bu_editable", { p_bu: bu.id }),
    supabase.from("bu_submissions").select("*").eq("bu_id", bu.id).maybeSingle<Submission>(),
    loadStage(supabase, bu.id),
  ]);
  return {
    supabase, profile, bu, config, stage,
    editable: editable.data === true,
    submission: sub.data ?? null,
  };
}

/**
 * Ofertas da BU. Escopos:
 *  - "all": tudo (originais, agrupamentos e avulsas);
 *  - "scorable": o que é classificado (agrupamentos e avulsas ativas), igual a `true` por compatibilidade;
 *  - "originals": as ofertas cadastradas, sem os agrupamentos (etapa 1).
 */
export async function loadOffers(supabase: SupabaseClient, buId: string, scope: boolean | "all" | "scorable" | "originals" = "all") {
  const mode = scope === true ? "scorable" : scope === false ? "all" : scope;
  const { data } = await supabase.from("offers").select("*").eq("bu_id", buId).order("code", { nullsFirst: false }).order("name");
  const all = ((data ?? []) as Offer[]).map((o) => ({ ...o, ticket_medio: o.ticket_medio == null ? null : Number(o.ticket_medio) }));
  return mode === "scorable" ? all.filter(isScorable) : mode === "originals" ? all.filter((o) => !o.is_group) : all;
}

export async function loadStage(supabase: SupabaseClient, buId: string): Promise<BuStage> {
  const { data } = await supabase.from("bu_progress").select("offers_confirmed_at,grouping_confirmed_at").eq("bu_id", buId).maybeSingle();
  return { offersConfirmedAt: data?.offers_confirmed_at ?? null, groupingConfirmedAt: data?.grouping_confirmed_at ?? null };
}

export type StageKey = "ofertas" | "agrupamento" | "classificacao";
/** Etapa em que a BU está: a primeira ainda não confirmada. */
export const currentStage = (s: BuStage): StageKey => (!s.offersConfirmedAt ? "ofertas" : !s.groupingConfirmedAt ? "agrupamento" : "classificacao");

export async function loadEvaluations(supabase: SupabaseClient, buId: string) {
  const { data } = await supabase.from("evaluations_scored").select("*").eq("bu_id", buId);
  return (data ?? []) as EvaluationScored[];
}

export interface WaveStatus { name: string; scope: string; deadline: string | null; left: number | null; done: number; total: number; pct: number }

/** Andamento de uma BU (ou do conjunto de ofertas/notas recebido) em cada onda de entrega. */
export function waveStatuses(waves: Wave[], offers: Offer[], evals: EvaluationScored[]): WaveStatus[] {
  return waves.map((w) => {
    const p = progressOf(offers, w.segments, evals);
    return { name: w.name, scope: waveScope(w), deadline: w.deadline, left: daysUntil(w.deadline), done: p.done, total: p.total, pct: p.total ? Math.round((p.done / p.total) * 100) : 0 };
  });
}

export function progressOf(offers: Offer[], segments: Segment[], evals: EvaluationScored[]) {
  const byKey = new Map(evals.map((e) => [`${e.offer_id}:${e.segment_id}`, e]));
  const activeOffers = offers.filter(isScorable);
  let done = 0;
  for (const o of activeOffers) for (const s of segments) if (isEvaluationDone(byKey.get(`${o.id}:${s.id}`))) done++;
  return { total: activeOffers.length * segments.length, done };
}

export const STATUS_LABEL: Record<string, string> = {
  none: "Não iniciado",
  progress: "Em andamento",
  submitted: "Enviado",
  reopened: "Reaberto",
};

export function statusOf(sub: Submission | null, done: number): "none" | "progress" | "submitted" | "reopened" {
  if (sub?.status === "submitted") return "submitted";
  if (sub?.status === "reopened") return "reopened";
  return done > 0 ? "progress" : "none";
}

export { daysUntil, fmtBRL, fmtDate, fmtDateTime } from "@/lib/format";

/** Opções do campo BU no cadastro de ofertas: admin vê todas as BUs ativas; head, só as dele. */
export async function buOptionsFor(supabase: SupabaseClient, profile: { id: string; role: string }, config: Config) {
  let allowed: string[] | null = null;
  if (profile.role === "head") {
    const { data } = await supabase.from("user_bus").select("bu_id").eq("user_id", profile.id);
    allowed = (data ?? []).map((r) => r.bu_id as string);
  }
  return config.bus.filter((b) => b.active && (!allowed || allowed.includes(b.id))).map((b) => ({ id: b.id, code: b.code, name: b.name }));
}

/** Próximo ID de cada BU informada (OF-NN ou AG-NN), para exibir no cadastro antes de salvar. */
export async function nextCodesFor(supabase: SupabaseClient, buIds: string[], isGroup = false) {
  const out: Record<string, string> = {};
  if (buIds.length === 0) return out;
  const { data } = await supabase.from("offers").select("bu_id,code").in("bu_id", buIds);
  for (const id of buIds) out[id] = nextOfferCode((data ?? []).filter((r) => r.bu_id === id).map((r) => r.code as string | null), isGroup);
  return out;
}

/** Números do andamento da BU para o resumo das etapas. */
export function buSummary(offers: Offer[], segments: Segment[], evals: EvaluationScored[]) {
  const active = offers.filter((o) => o.active);
  const p = progressOf(offers, segments, evals);
  return {
    originals: active.filter((o) => !o.is_group).length,
    groups: active.filter((o) => o.is_group).length,
    grouped: active.filter((o) => o.group_id).length,
    scorable: offers.filter(isScorable).length,
    done: p.done,
    total: p.total,
  };
}
export type BuSummary = ReturnType<typeof buSummary>;

/**
 * A classificação (matriz, avaliação) só abre depois das etapas 1 e 2. O head é levado para a etapa
 * em que está; a Diretoria Corporativa não é bloqueada. O banco também recusa notas antes disso.
 */
export function requireStageReady(ctx: { profile: { role: string }; bu: { code: string }; stage: BuStage }) {
  if (ctx.profile.role !== "head" || ctx.stage.groupingConfirmedAt) return;
  redirect(currentStage(ctx.stage) === "ofertas" ? `/bu/${ctx.bu.code}/ofertas` : `/bu/${ctx.bu.code}/agrupamento`);
}
