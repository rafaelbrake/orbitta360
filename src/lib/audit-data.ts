import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditCtx } from "@/lib/audit";
import { fetchAll } from "@/lib/consolidated";
import type { Config } from "@/lib/data";

export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_EXPORT_MAX = 5000;

export interface AuditFilter { table?: string; userId?: string; action?: string; from?: string; to?: string }
export interface AuditRow {
  id: number; at: string; user_id: string | null; table_name: string; row_id: string | null; action: string;
  old_row: Record<string, unknown> | null; new_row: Record<string, unknown> | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Filtros vindos da querystring, já validados. As datas valem no horário de Brasília (UTC−3). */
export function parseAuditFilter(get: (k: string) => string | undefined): AuditFilter {
  const d = (k: string) => { const v = get(k); return v && DATE.test(v) ? v : undefined; };
  const uuid = get("user");
  return {
    table: get("table") || undefined,
    action: ["INSERT", "UPDATE", "DELETE"].includes(get("action") ?? "") ? get("action") : undefined,
    userId: uuid && /^[0-9a-f-]{36}$/i.test(uuid) ? uuid : undefined,
    from: d("from"),
    to: d("to"),
  };
}

function query(supabase: SupabaseClient, f: AuditFilter, count: boolean) {
  let q = supabase
    .from("audit_log")
    .select("id,at,user_id,table_name,row_id,action,old_row,new_row", count ? { count: "exact" } : undefined)
    .order("at", { ascending: false })
    .order("id", { ascending: false });
  if (f.table) q = q.eq("table_name", f.table);
  if (f.action) q = q.eq("action", f.action);
  if (f.userId) q = q.eq("user_id", f.userId);
  if (f.from) q = q.gte("at", `${f.from}T00:00:00-03:00`);
  if (f.to) q = q.lte("at", `${f.to}T23:59:59.999-03:00`);
  return q;
}

export async function loadAuditPage(supabase: SupabaseClient, f: AuditFilter, page: number) {
  const from = (page - 1) * AUDIT_PAGE_SIZE;
  const { data, count, error } = await query(supabase, f, true).range(from, from + AUDIT_PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as AuditRow[], total: count ?? 0 };
}

export async function loadAuditForExport(supabase: SupabaseClient, f: AuditFilter) {
  const out: AuditRow[] = [];
  for (let from = 0; from < AUDIT_EXPORT_MAX; from += 1000) {
    const { data, error } = await query(supabase, f, false).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as AuditRow[]));
    if (!data || data.length < 1000) break;
  }
  return out.slice(0, AUDIT_EXPORT_MAX);
}

export async function loadAuditCtx(supabase: SupabaseClient, config: Config) {
  const [offers, people] = await Promise.all([
    fetchAll<{ id: string; name: string }>((a, b) => supabase.from("offers").select("id,name").order("id").range(a, b)),
    fetchAll<{ id: string; full_name: string | null; email: string }>((a, b) => supabase.from("profiles").select("id,full_name,email").order("id").range(a, b)),
  ]);
  const ctx: AuditCtx = {
    offers: new Map(offers.map((o) => [o.id, o.name])),
    segments: new Map(config.segments.map((s) => [s.id, s.name])),
    bus: new Map(config.bus.map((b) => [b.id, b.code])),
    people: new Map(people.map((p) => [p.id, p.full_name || p.email])),
    criteria: new Map(config.criteria.map((c) => [c.id, c.name])),
  };
  return ctx;
}
