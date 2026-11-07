import { DIRECTORS_ENABLED } from "@/lib/features";
import Link from "next/link";
import { ACTION_LABEL, TABLE_LABEL, describeRow, diffRow } from "@/lib/audit";
import { AUDIT_EXPORT_MAX, AUDIT_PAGE_SIZE, loadAuditCtx, loadAuditPage, parseAuditFilter } from "@/lib/audit-data";
import { qp } from "@/lib/consolidated";
import { fmtDateTime, loadConfig } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requireProfile("admin");
  const config = await loadConfig(supabase);
  const filter = parseAuditFilter((k) => qp(sp[k]));
  const page = Math.max(1, Number.parseInt(qp(sp.page) ?? "1", 10) || 1);

  const [{ rows, total }, ctx, people] = await Promise.all([
    loadAuditPage(supabase, filter, page),
    loadAuditCtx(supabase, config),
    supabase.from("profiles").select("id,full_name,email").order("full_name"),
  ]);
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const base = new URLSearchParams(Object.entries({ table: filter.table, action: filter.action, user: filter.userId, from: filter.from, to: filter.to }).filter(([, v]) => v) as [string, string][]);
  const href = (p: number) => `/admin/auditoria?${new URLSearchParams({ ...Object.fromEntries(base), page: String(p) })}`;
  const who = (id: string | null) => (id ? ctx.people.get(id) ?? "—" : "Sistema");

  return (
    <div>
      <PageHeader
        title="Log de auditoria"
        subtitle={DIRECTORS_ENABLED
          ? "Notas, pitches e ofertas só entram aqui depois que a BU foi enviada ao menos uma vez (e os registros de Manter / Mudar / Treinar, depois do primeiro envio do diretor); configurações, perfis e envios são sempre registrados."
          : "Notas, pitches e ofertas só entram aqui depois que a BU foi enviada ao menos uma vez; configurações, perfis e envios são sempre registrados."}
      />

      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="a-table">O quê</label>
          <select id="a-table" name="table" className="input" defaultValue={filter.table ?? ""}>
            <option value="">Tudo</option>
            {Object.entries(TABLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="a-user">Quem</label>
          <select id="a-user" name="user" className="input" defaultValue={filter.userId ?? ""}>
            <option value="">Todos</option>
            {(people.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="a-action">Ação</label>
          <select id="a-action" name="action" className="input" defaultValue={filter.action ?? ""}>
            <option value="">Todas</option>
            {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="a-from">De</label><input id="a-from" type="date" name="from" defaultValue={filter.from} className="input" /></div>
        <div><label className="label" htmlFor="a-to">Até</label><input id="a-to" type="date" name="to" defaultValue={filter.to} className="input" /></div>
        <button className="btn btn-primary">Filtrar</button>
        <Link href="/admin/auditoria" className="btn">Limpar</Link>
        <a className="btn ml-auto" download href={`/admin/auditoria/export?${base}`}>Exportar para Excel{total > AUDIT_EXPORT_MAX ? ` (primeiros ${AUDIT_EXPORT_MAX})` : ""}</a>
      </form>

      <p className="mb-2 text-sm text-(--ink-2)">{total} registro{total === 1 ? "" : "s"}.</p>
      {rows.length === 0 ? (
        <div className="card"><EmptyState icon="history" title="Nada registrado para este filtro">Tente ampliar o período ou limpar os filtros.</EmptyState></div>
      ) : (
      <div className="table-wrap">
        <table className="min-w-[48rem]">
          <thead><tr>
            <th className="th">Quando</th><th className="th">Quem</th><th className="th">O quê</th><th className="th">Referente a</th><th className="th">Alterações</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const changes = r.action === "UPDATE" ? diffRow(r.old_row, r.new_row, ctx) : [];
              return (
                <tr key={r.id}>
                  <td className="td whitespace-nowrap">{fmtDateTime(r.at)}</td>
                  <td className="td whitespace-nowrap">{who(r.user_id)}</td>
                  <td className="td whitespace-nowrap">{TABLE_LABEL[r.table_name] ?? r.table_name}<div className="text-xs text-(--ink-3)">{ACTION_LABEL[r.action] ?? r.action}</div></td>
                  <td className="td">{describeRow(r.table_name, r.new_row ?? r.old_row, ctx) || "—"}</td>
                  <td className="td min-w-64 text-xs">
                    {r.action === "INSERT" && "criado"}
                    {r.action === "DELETE" && "removido"}
                    {r.action === "UPDATE" && (changes.length ? (
                      <ul className="space-y-0.5">{changes.map((c) => <li key={c.field}><strong>{c.label}:</strong> {c.before} → {c.after}</li>)}</ul>
                    ) : "sem mudança relevante")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {pages > 1 && (
        <nav className="mt-3 flex items-center gap-3 text-sm" aria-label="Paginação">
          {page > 1 ? <Link className="btn" href={href(page - 1)}>← Anterior</Link> : <span />}
          <span className="text-(--ink-2)">Página {page} de {pages}</span>
          {page < pages && <Link className="btn" href={href(page + 1)}>Próxima →</Link>}
        </nav>
      )}
    </div>
  );
}
