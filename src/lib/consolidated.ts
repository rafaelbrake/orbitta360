import { DIRECTORS_ENABLED } from "@/lib/features";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireProfile } from "@/lib/session";
import type { Bu, EvaluationScored, MmtRecord, MmtRow, Pitch, PitchRow, Segment } from "@/lib/types";

/** Autorização das telas consolidadas: admin; diretor só se o admin liberou o detalhe (o RLS reforça no banco). */
export async function requireConsolidated(opts: { adminOnly?: boolean } = {}) {
  const ctx = await requireProfile("admin", "diretor");
  if (ctx.profile.role === "diretor" && !DIRECTORS_ENABLED) redirect("/em-breve");
  if (ctx.profile.role === "diretor" && (opts.adminOnly || !ctx.profile.can_see_bu_detail)) redirect("/diretor");
  return ctx;
}

/** PostgREST limita cada resposta (1.000 linhas por padrão): lê tudo em páginas. */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  size = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

export interface RankingRow {
  evaluationId: string;
  offerId: string;
  offerCode: string | null;
  offerName: string;
  bu: Bu;
  segment: Segment;
  score: number;
  classCode: string;
  specialistLed: boolean;
  notes: [number, number, number, number, number];
  hasPitch: boolean;
}

export interface RankingFilter { segmentId?: string; buId?: string; classCode?: string }

/**
 * Ofertas pontuadas (nota completa, não "não se aplica", oferta ativa), com BU, segmento e
 * se há pitch. Ordem: score decrescente, depois nome. Tudo lido sob RLS do usuário logado.
 */
export async function loadRanking(
  supabase: SupabaseClient,
  ref: { bus: Bu[]; segments: Segment[] },
  filter: RankingFilter = {},
): Promise<RankingRow[]> {
  const evals = await fetchAll<EvaluationScored>((from, to) => {
    let q = supabase.from("evaluations_scored").select("*").not("score", "is", null).order("id").range(from, to);
    if (filter.segmentId) q = q.eq("segment_id", filter.segmentId);
    if (filter.buId) q = q.eq("bu_id", filter.buId);
    return q;
  });
  const offers = await fetchAll<{ id: string; code: string | null; name: string; active: boolean }>((from, to) =>
    supabase.from("offers").select("id,code,name,active").order("id").range(from, to),
  );
  const pitches = await fetchAll<{ offer_id: string; segment_id: string; descricao: string | null }>((from, to) =>
    supabase.from("pitches").select("offer_id,segment_id,descricao").order("id").range(from, to),
  );
  const offerById = new Map(offers.map((o) => [o.id, o]));
  const buById = new Map(ref.bus.map((b) => [b.id, b]));
  const segById = new Map(ref.segments.map((s) => [s.id, s]));
  const pitchKeys = new Set(pitches.filter((p) => (p.descricao ?? "").trim()).map((p) => `${p.offer_id}:${p.segment_id}`));

  const rows: RankingRow[] = [];
  for (const e of evals) {
    const o = offerById.get(e.offer_id);
    const bu = buById.get(e.bu_id);
    const segment = segById.get(e.segment_id);
    if (!o || !o.active || !bu || !segment || e.score == null || e.not_applicable || !e.class_code) continue;
    if (filter.classCode && e.class_code !== filter.classCode) continue;
    rows.push({
      evaluationId: e.id, offerId: o.id, offerCode: o.code, offerName: o.name, bu, segment,
      score: e.score, classCode: e.class_code, specialistLed: e.specialist_led,
      notes: [e.n1!, e.n2!, e.n3!, e.n4!, e.n5!],
      hasPitch: pitchKeys.has(`${e.offer_id}:${e.segment_id}`),
    });
  }
  return rows.sort((a, b) => b.score - a.score || a.offerName.localeCompare(b.offerName, "pt-BR"));
}

export interface HeatCell { buId: string; segmentId: string; priorityCount: number; offers: number; maxScore: number | null; maxClass: string | null }

/** Heatmap BU × segmento: nº de ofertas Alta + Potencial e o maior score de cada célula. */
export function buildHeatmap(rows: RankingRow[], bus: Bu[], segments: Segment[]) {
  const cells = new Map<string, HeatCell>();
  for (const b of bus) for (const s of segments) {
    cells.set(`${b.id}:${s.id}`, { buId: b.id, segmentId: s.id, priorityCount: 0, offers: 0, maxScore: null, maxClass: null });
  }
  for (const r of rows) {
    const c = cells.get(`${r.bu.id}:${r.segment.id}`);
    if (!c) continue;
    c.offers++;
    if (r.classCode === "alta" || r.classCode === "potencial") c.priorityCount++;
    if (c.maxScore == null || r.score > c.maxScore) { c.maxScore = r.score; c.maxClass = r.classCode; }
  }
  return cells;
}

export interface MmtFilter { segmentId?: string; buId?: string; type?: string }

/** Registros de Manter/Mudar/Treinar com nomes resolvidos (admin lê todos; o RLS limita os demais). */
export async function loadMmtRows(
  supabase: SupabaseClient,
  ref: { bus: Bu[]; segments: Segment[] },
  filter: MmtFilter = {},
): Promise<MmtRow[]> {
  const [records, offers, people] = await Promise.all([
    fetchAll<MmtRecord>((from, to) => {
      let q = supabase.from("mmt_records").select("*").order("id").range(from, to);
      if (filter.segmentId) q = q.eq("segment_id", filter.segmentId);
      if (filter.buId) q = q.eq("bu_id", filter.buId);
      if (filter.type) q = q.eq("type", filter.type);
      return q;
    }),
    fetchAll<{ id: string; name: string }>((from, to) => supabase.from("offers").select("id,name").order("id").range(from, to)),
    fetchAll<{ id: string; full_name: string | null; email: string }>((from, to) =>
      supabase.from("profiles").select("id,full_name,email").order("id").range(from, to)),
  ]);
  const offerName = new Map(offers.map((o) => [o.id, o.name]));
  const person = new Map(people.map((p) => [p.id, p.full_name || p.email]));
  const seg = new Map(ref.segments.map((s) => [s.id, s.name]));
  const bu = new Map(ref.bus.map((b) => [b.id, b.code]));
  return records.map((r) => ({
    ...r,
    segmentName: seg.get(r.segment_id) ?? "—",
    buCode: bu.get(r.bu_id) ?? "—",
    offerName: r.offer_id ? (offerName.get(r.offer_id) ?? null) : null,
    authorName: person.get(r.author_id) ?? "—",
  }));
}

/** Pitches (oferta × segmento) com nomes resolvidos. */
export async function loadPitchRows(
  supabase: SupabaseClient,
  ref: { bus: Bu[]; segments: Segment[] },
  filter: { segmentId?: string; buId?: string; offerId?: string } = {},
): Promise<PitchRow[]> {
  const [pitches, offers] = await Promise.all([
    fetchAll<Pitch>((from, to) => {
      let q = supabase.from("pitches").select("*").order("id").range(from, to);
      if (filter.segmentId) q = q.eq("segment_id", filter.segmentId);
      if (filter.buId) q = q.eq("bu_id", filter.buId);
      if (filter.offerId) q = q.eq("offer_id", filter.offerId);
      return q;
    }),
    fetchAll<{ id: string; code: string | null; name: string }>((from, to) => supabase.from("offers").select("id,code,name").order("id").range(from, to)),
  ]);
  const offerById = new Map(offers.map((o) => [o.id, o]));
  const seg = new Map(ref.segments.map((s) => [s.id, s.name]));
  const bu = new Map(ref.bus.map((b) => [b.id, b.code]));
  return pitches.map((p) => ({
    ...p,
    segmentName: seg.get(p.segment_id) ?? "—",
    buCode: bu.get(p.bu_id) ?? "—",
    offerName: offerById.get(p.offer_id)?.name ?? "—",
    offerCode: offerById.get(p.offer_id)?.code ?? null,
    ticket_medio: p.ticket_medio == null ? null : Number(p.ticket_medio),
    cases: Array.isArray(p.cases) ? p.cases : [],
  }));
}

/** Lê um parâmetro de querystring como texto simples (primeiro valor). */
export function qp(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : undefined;
}
