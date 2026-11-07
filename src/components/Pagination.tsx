import Link from "next/link";
import { Icon } from "@/components/Icon";
import { qs } from "@/lib/list";

/** Paginação por links (funciona sem JavaScript e preserva os filtros da URL). */
export function Pagination({ page, pages, total, from, to, basePath, params }: {
  page: number; pages: number; total: number; from: number; to: number; basePath: string; params: Record<string, string | undefined>;
}) {
  if (total === 0) return null;
  const href = (p: number) => `${basePath}${qs({ ...params, page: p > 1 ? p : undefined })}`;
  return (
    <nav className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Paginação">
      <span className="text-(--ink-3)">Mostrando {from}–{to} de {total}</span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 ? <Link className="btn btn-sm" href={href(page - 1)}><Icon name="chevron_left" size={18} />Anterior</Link> : <span className="btn btn-sm" aria-disabled>Anterior</span>}
          <span className="px-1 text-(--ink-2)">Página {page} de {pages}</span>
          {page < pages ? <Link className="btn btn-sm" href={href(page + 1)}>Próxima<Icon name="chevron_right" size={18} /></Link> : <span className="btn btn-sm" aria-disabled>Próxima</span>}
        </div>
      )}
    </nav>
  );
}
