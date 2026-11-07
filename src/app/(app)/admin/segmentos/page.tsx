import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { ListFilters, type FilterField } from "@/components/ListFilters";
import { Pagination } from "@/components/Pagination";
import { PageHeader } from "@/components/ui";
import { loadConfig } from "@/lib/data";
import { distinct, matchesQuery, pageParam, paginate, param } from "@/lib/list";
import { requireProfile } from "@/lib/session";

export default async function SegmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requireProfile("admin");
  const config = await loadConfig(supabase);
  const f = { q: param(sp.q), wave: param(sp.wave), status: param(sp.status) };
  const filtered = config.segments
    .filter((s) => matchesQuery(f.q, s.name, s.leader))
    .filter((s) => !f.wave || s.wave === f.wave)
    .filter((s) => !f.status || (f.status === "ativo" ? s.active : !s.active));
  const pg = paginate(filtered, pageParam(sp.page));
  const fields: FilterField[] = [
    { type: "search", name: "q", placeholder: "Nome ou líder" },
    { type: "select", name: "wave", label: "Onda", options: distinct(config.segments.map((s) => s.wave)).map((v) => ({ value: v, label: v })) },
    { type: "select", name: "status", label: "Situação", allLabel: "Todas", options: [{ value: "ativo", label: "Ativos" }, { value: "inativo", label: "Inativos" }] },
  ];

  return (
    <div>
      <PageHeader
        title="Segmentos"
        subtitle="Mercados em que as ofertas são pontuadas, agrupados por onda de lançamento."
        actions={<Link href="/admin/segmentos/novo" className="btn btn-primary"><Icon name="add" size={18} />Novo segmento</Link>}
      />
      <ListFilters fields={fields} total={filtered.length} noun={["segmento", "segmentos"]} />
      {pg.total === 0 ? (
        <div className="card"><EmptyState icon="target" title="Nenhum segmento encontrado">Ajuste os filtros ou cadastre um segmento.</EmptyState></div>
      ) : (
        <div className="table-wrap">
          <table className="min-w-[40rem]">
            <thead><tr><th className="th w-16">Ordem</th><th className="th">Segmento</th><th className="th">Onda</th><th className="th">Líder</th><th className="th">Pontuação</th><th className="th col-actions w-32"></th></tr></thead>
            <tbody>
              {pg.items.map((s) => (
                <tr key={s.id} className={s.active ? "" : "opacity-70"}>
                  <td className="td tabular-nums text-(--ink-3)">{s.sort}</td>
                  <td className="td"><Link href={`/admin/segmentos/${s.id}`} className="font-semibold text-(--forest) hover:underline">{s.name}</Link></td>
                  <td className="td"><span className="badge bg-(--brand-50) text-(--forest) ring-1 ring-(--line)">{s.wave}</span></td>
                  <td className="td text-sm">{s.leader || "—"}</td>
                  <td className="td"><span className={`badge ${s.active ? "bg-(--brand-100) text-(--brand-800)" : "bg-slate-200 text-slate-700"}`}>{s.active ? "Ativo" : "Inativo"}</span></td>
                  <td className="td col-actions text-right"><Link href={`/admin/segmentos/${s.id}`} className="btn btn-sm"><Icon name="edit" size={16} />Ver / editar</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination {...pg} basePath="/admin/segmentos" params={f} />
    </div>
  );
}
