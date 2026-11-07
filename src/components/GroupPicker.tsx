"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { fmtTicket } from "@/lib/offers";

export interface PickerRow { id: string; code: string | null; name: string; description: string | null; offer_type: string | null; revenue_model: string | null; ticket_medio: number | null }

/**
 * Lista de ofertas avulsas com seleção múltipla. A seleção sobrevive a filtros e páginas;
 * "Agrupar" leva à tela de criação com as ofertas escolhidas, e "Adicionar" põe as escolhidas em um agrupamento existente.
 */
export function GroupPicker({ code, rows, allIds, groups, newHref, addAction, editable }: {
  code: string; rows: PickerRow[]; allIds: string[]; groups: { id: string; name: string }[]; newHref: string;
  addAction: (fd: FormData) => Promise<void>; editable: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pageAll = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const togglePage = () => setSelected((s) => { const n = new Set(s); for (const r of rows) { if (pageAll) n.delete(r.id); else n.add(r.id); } return n; });
  const count = selected.size;

  return (
    <form method="get" action={newHref}>
      {[...selected].map((id) => <input key={id} type="hidden" name="ids" value={id} />)}

      {editable && (
        <div className={`sticky top-14 z-[5] mb-3 flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors lg:top-0 ${count ? "border-(--brand) bg-(--brand-50)" : "border-(--line) bg-white"}`}>
          <span className="text-sm font-semibold text-(--forest)">{count ? `${count} ${count === 1 ? "oferta selecionada" : "ofertas selecionadas"}` : "Marque as ofertas que formam uma só"}</span>
          {allIds.length > rows.length && count < allIds.length && (
            <button type="button" className="text-sm font-medium text-(--brand) underline" onClick={() => setSelected(new Set(allIds))}>Selecionar as {allIds.length} filtradas</button>
          )}
          {count > 0 && <button type="button" className="text-sm text-(--ink-2) underline" onClick={() => setSelected(new Set())}>Limpar seleção</button>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {groups.length > 0 && (
              <>
                <select name="group_id" aria-label="Agrupamento de destino" className="input !w-auto" defaultValue="">
                  <option value="" disabled>Adicionar a…</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                {/* o código da BU entra na própria ação: um botão com formAction não pode ter "name" (o React o sobrescreve) */}
                <button type="submit" formAction={(fd) => { fd.set("code", code); return addAction(fd); }} className="btn" disabled={count < 1}>Adicionar</button>
              </>
            )}
            <button type="submit" className="btn btn-primary" disabled={count < 2}>
              <Icon name="list_alt" size={18} />Agrupar selecionadas
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="min-w-[44rem]">
          <thead><tr>
            {editable && <th className="th w-10"><input type="checkbox" className="size-4" checked={pageAll} onChange={togglePage} aria-label="Selecionar todas desta página" /></th>}
            <th className="th">ID</th><th className="th">Oferta</th><th className="th">Tipo</th><th className="th">Modelo de receita</th><th className="th text-right">Ticket / volume do deal</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={selected.has(r.id) ? "[&>td]:!bg-(--brand-50)" : ""}>
                {editable && <td className="td"><input type="checkbox" className="size-4" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Selecionar ${r.name}`} /></td>}
                <td className="td whitespace-nowrap text-(--ink-3)">{r.code ?? "—"}</td>
                <td className="td"><label className={editable ? "cursor-pointer" : ""} htmlFor={undefined}><span className="font-semibold text-(--forest)">{r.name}</span></label>{r.description && <div className="line-clamp-1 max-w-sm text-xs text-(--ink-3)">{r.description}</div>}</td>
                <td className="td text-sm">{r.offer_type ?? "—"}</td>
                <td className="td text-sm">{r.revenue_model ?? "—"}</td>
                <td className="td text-right tabular-nums">{fmtTicket(r.ticket_medio, r.revenue_model)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
