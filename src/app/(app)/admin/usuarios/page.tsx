import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { ListFilters, type FilterField } from "@/components/ListFilters";
import { Pagination } from "@/components/Pagination";
import { PageHeader } from "@/components/ui";
import { loadConfig } from "@/lib/data";
import { matchesQuery, pageParam, paginate, param } from "@/lib/list";
import { requireProfile } from "@/lib/session";
import type { Profile } from "@/lib/types";

const ROLE_LABEL = { admin: "Diretoria Corporativa", head: "Head de BU", diretor: "Diretor Comercial" } as const;
const ROLE_STYLE = { admin: "bg-(--forest) text-white", head: "bg-(--brand-100) text-(--brand-800)", diretor: "bg-(--accent-100) text-(--accent-800)" } as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requireProfile("admin");
  const config = await loadConfig(supabase);
  const [p, ub, us] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("user_bus").select("user_id,bu_id"),
    supabase.from("user_segments").select("user_id,segment_id"),
  ]);
  const users = (p.data ?? []) as Profile[];
  const buLinks = (ub.data ?? []) as { user_id: string; bu_id: string }[];
  const segLinks = (us.data ?? []) as { user_id: string; segment_id: string }[];
  const buCode = new Map(config.bus.map((b) => [b.id, b.code]));
  const busOf = (id: string) => buLinks.filter((l) => l.user_id === id).map((l) => buCode.get(l.bu_id) ?? "").filter(Boolean);
  const segsOf = (id: string) => segLinks.filter((l) => l.user_id === id).length;

  const f = { q: param(sp.q), role: param(sp.role), status: param(sp.status), bu: param(sp.bu) };
  const filtered = users
    .filter((u) => matchesQuery(f.q, u.full_name, u.email, u.regional))
    .filter((u) => !f.role || u.role === f.role)
    .filter((u) => !f.status || (f.status === "ativo" ? u.active : !u.active))
    .filter((u) => !f.bu || buLinks.some((l) => l.user_id === u.id && l.bu_id === f.bu));
  const pg = paginate(filtered, pageParam(sp.page));

  const fields: FilterField[] = [
    { type: "search", name: "q", placeholder: "Nome, e-mail ou regional" },
    { type: "select", name: "role", label: "Perfil", options: Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })) },
    { type: "select", name: "bu", label: "BU", options: config.bus.map((b) => ({ value: b.id, label: b.code })) },
    { type: "select", name: "status", label: "Situação", allLabel: "Todas", options: [{ value: "ativo", label: "Ativos" }, { value: "inativo", label: "Inativos" }] },
  ];

  return (
    <div>
      <PageHeader
        title="Usuários"
        subtitle="Quem tem acesso ao Orbitta360 e com que perfil."
        actions={<Link href="/admin/usuarios/novo" className="btn btn-primary"><Icon name="add" size={18} />Convidar usuário</Link>}
      />
      <ListFilters fields={fields} total={filtered.length} noun={["usuário", "usuários"]} />

      {pg.total === 0 ? (
        <div className="card"><EmptyState icon="group" title="Nenhum usuário encontrado">Ajuste os filtros ou convide uma pessoa.</EmptyState></div>
      ) : (
        <div className="table-wrap">
          <table className="min-w-[44rem]">
            <thead><tr>
              <th className="th">Usuário</th><th className="th">Perfil</th><th className="th">Acesso</th><th className="th">Situação</th><th className="th col-actions w-32"></th>
            </tr></thead>
            <tbody>
              {pg.items.map((u) => {
                const bus = busOf(u.id);
                return (
                  <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                    <td className="td">
                      <Link href={`/admin/usuarios/${u.id}`} className="font-semibold text-(--forest) hover:underline">{u.full_name || u.email}</Link>
                      {u.full_name && <div className="text-xs text-(--ink-3)">{u.email}</div>}
                    </td>
                    <td className="td"><span className={`badge ${ROLE_STYLE[u.role]}`}>{ROLE_LABEL[u.role]}</span></td>
                    <td className="td text-sm text-(--ink-2)">
                      {u.role === "head" && (bus.length ? <div className="flex flex-wrap gap-1">{bus.map((c) => <span key={c} className="badge bg-(--brand-50) text-(--forest) ring-1 ring-(--line)">{c}</span>)}</div> : <span className="font-medium text-(--danger)">sem BU atribuída</span>)}
                      {u.role === "diretor" && <>{u.regional || "sem regional"} · {segsOf(u.id) ? `${segsOf(u.id)} ${segsOf(u.id) === 1 ? "segmento" : "segmentos"}` : "todos os segmentos"}{u.can_see_bu_detail && <span className="ml-1 text-(--brand)" title="Vê o detalhe por BU"><Icon name="visibility" size={14} className="inline" /></span>}</>}
                      {u.role === "admin" && "Tudo"}
                    </td>
                    <td className="td"><span className={`badge ${u.active ? "bg-(--brand-100) text-(--brand-800)" : "bg-slate-200 text-slate-700"}`}>{u.active ? "Ativo" : "Inativo"}</span></td>
                    <td className="td col-actions text-right"><Link href={`/admin/usuarios/${u.id}`} className="btn btn-sm"><Icon name="edit" size={16} />Ver / editar</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination {...pg} basePath="/admin/usuarios" params={f} />
    </div>
  );
}
