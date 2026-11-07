import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { ListFilters, type FilterField } from "@/components/ListFilters";
import { Pagination } from "@/components/Pagination";
import { PageHeader } from "@/components/ui";
import { fetchAll } from "@/lib/consolidated";
import { loadConfig } from "@/lib/data";
import { matchesQuery, pageParam, paginate, param } from "@/lib/list";
import { requireProfile } from "@/lib/session";

export default async function BusPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requireProfile("admin");
  const config = await loadConfig(supabase);
  const [offers, ub, pr] = await Promise.all([
    fetchAll<{ bu_id: string; active: boolean; is_group: boolean }>((a, b) => supabase.from("offers").select("bu_id,active,is_group").order("id").range(a, b)),
    supabase.from("user_bus").select("user_id,bu_id"),
    supabase.from("profiles").select("id,full_name,email"),
  ]);
  const people = new Map((pr.data ?? []).map((p) => [p.id as string, (p.full_name || p.email) as string]));
  const headsOf = (buId: string) => (ub.data ?? []).filter((l) => l.bu_id === buId).map((l) => people.get(l.user_id as string) ?? "").filter(Boolean);
  const offersOf = (buId: string) => offers.filter((o) => o.bu_id === buId && o.active && !o.is_group).length;

  const f = { q: param(sp.q), status: param(sp.status) };
  const filtered = config.bus
    .filter((b) => matchesQuery(f.q, b.code, b.name, ...headsOf(b.id)))
    .filter((b) => !f.status || (f.status === "ativa" ? b.active : !b.active));
  const pg = paginate(filtered, pageParam(sp.page));
  const fields: FilterField[] = [
    { type: "search", name: "q", placeholder: "Sigla, nome ou head" },
    { type: "select", name: "status", label: "Situação", allLabel: "Todas", options: [{ value: "ativa", label: "Ativas" }, { value: "inativa", label: "Inativas" }] },
  ];

  return (
    <div>
      <PageHeader
        title="Unidades de Negócio"
        subtitle="As BUs que pontuam ofertas e recebem heads."
        actions={<Link href="/admin/bus/novo" className="btn btn-primary"><Icon name="add" size={18} />Nova BU</Link>}
      />
      <ListFilters fields={fields} total={filtered.length} noun={["BU", "BUs"]} />
      {pg.total === 0 ? (
        <div className="card"><EmptyState icon="inventory_2" title="Nenhuma BU encontrada">Ajuste os filtros ou cadastre uma BU.</EmptyState></div>
      ) : (
        <div className="table-wrap">
          <table className="min-w-[40rem]">
            <thead><tr><th className="th w-16">Ordem</th><th className="th">BU</th><th className="th">Heads</th><th className="th text-right">Ofertas ativas</th><th className="th">Situação</th><th className="th col-actions w-32"></th></tr></thead>
            <tbody>
              {pg.items.map((b) => {
                const heads = headsOf(b.id);
                return (
                  <tr key={b.id} className={b.active ? "" : "opacity-70"}>
                    <td className="td tabular-nums text-(--ink-3)">{b.sort}</td>
                    <td className="td"><Link href={`/admin/bus/${b.id}`} className="font-semibold text-(--forest) hover:underline">{b.code}</Link><div className="text-xs text-(--ink-3)">{b.name}</div></td>
                    <td className="td text-sm">{heads.length ? heads.join(", ") : <span className="font-medium text-(--danger)">sem head atribuído</span>}</td>
                    <td className="td text-right tabular-nums">{offersOf(b.id)}</td>
                    <td className="td"><span className={`badge ${b.active ? "bg-(--brand-100) text-(--brand-800)" : "bg-slate-200 text-slate-700"}`}>{b.active ? "Ativa" : "Inativa"}</span></td>
                    <td className="td col-actions text-right"><Link href={`/admin/bus/${b.id}`} className="btn btn-sm"><Icon name="edit" size={16} />Ver / editar</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination {...pg} basePath="/admin/bus" params={f} />
    </div>
  );
}
