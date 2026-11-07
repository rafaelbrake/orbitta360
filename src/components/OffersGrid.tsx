"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { bulkSetOffers, saveOfferInline, setOffersActive } from "@/app/actions/bu";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { missingOfferFields, OFFER_TYPES, REVENUE_MODELS, ticketUnit } from "@/lib/offers";

export interface GridRow {
  id: string; code: string | null; name: string; description: string | null;
  offer_type: string | null; revenue_model: string | null; ticket_medio: number | null;
  active: boolean; groupId: string | null; groupName: string | null;
}
interface Edit { offer_type?: string; revenue_model?: string; ticket_medio?: string }
type RowState = "saving" | "saved" | "error";

/**
 * Tabela da etapa 1 com edição na própria linha: tipo e modelo em lista, ticket digitado.
 * Cada mudança é salva sozinha. É possível marcar várias linhas e aplicar tipo e/ou modelo de uma vez.
 * Cada oferta pode ser "desconsiderada" (não apaga: só sai das próximas etapas) e reconsiderada depois.
 * Os números da página (faltam preencher, progresso) são atualizados depois de uma pausa nas edições.
 */
export function OffersGrid({ code, rows, allIds, editable }: { code: string; rows: GridRow[]; allIds: string[]; editable: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [state, setState] = useState<Record<string, RowState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ type: string; model: string }>({ type: "", model: "" });
  const [busy, setBusy] = useState<"tipo" | "ativo" | null>(null);
  const applying = busy !== null;
  const [actives, setActives] = useState<Record<string, boolean>>({});
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = (r: GridRow) => actives[r.id] ?? r.active;
  const val = (r: GridRow) => ({
    offer_type: edits[r.id]?.offer_type ?? r.offer_type ?? "",
    revenue_model: edits[r.id]?.revenue_model ?? r.revenue_model ?? "",
    ticket_medio: edits[r.id]?.ticket_medio ?? (r.ticket_medio != null ? String(r.ticket_medio) : ""),
  });

  const scheduleRefresh = () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 1200);
  };

  async function persist(r: GridRow, patch: Edit) {
    setEdits((p) => ({ ...p, [r.id]: { ...p[r.id], ...patch } }));
    setState((p) => ({ ...p, [r.id]: "saving" }));
    const res = await saveOfferInline({ id: r.id, patch });
    setState((p) => ({ ...p, [r.id]: res.ok ? "saved" : "error" }));
    setErrors((p) => {
      const n = { ...p };
      if (res.ok) delete n[r.id];
      else n[r.id] = res.error;
      return n;
    });
    if (res.ok) scheduleRefresh();
  }

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pageAll = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const togglePage = () => setSelected((s) => { const n = new Set(s); for (const r of rows) { if (pageAll) n.delete(r.id); else n.add(r.id); } return n; });

  async function setActive(ids: string[], active: boolean) {
    setBusy("ativo");
    const res = await setOffersActive({ ids, active });
    setBusy(null);
    if (!res.ok) return toast("erro", res.error);
    if (res.count > 0) {
      setActives((p) => {
        const n = { ...p };
        for (const id of ids) {
          const row = rows.find((x) => x.id === id);
          if (row && !row.groupId) n[id] = active;
        }
        return n;
      });
      scheduleRefresh();
    }
    const what = active ? (res.count === 1 ? "oferta reconsiderada" : "ofertas reconsideradas") : (res.count === 1 ? "oferta desconsiderada" : "ofertas desconsideradas");
    if (res.count === 0) toast("erro", res.note ?? "Nada mudou: as ofertas já estavam assim.");
    else toast("ok", `${res.count} ${what}.${res.note ? ` Não mudaram: ${res.note}` : ""}`);
    if (ids.length > 1) setSelected(new Set());
  }

  async function applyBulk() {
    const ids = [...selected];
    if (!bulk.type && !bulk.model) return toast("erro", "Escolha o tipo e/ou o modelo para aplicar.");
    setBusy("tipo");
    const res = await bulkSetOffers({ ids, offer_type: bulk.type || undefined, revenue_model: bulk.model || undefined });
    setBusy(null);
    if (!res.ok) return toast("erro", res.error);
    setEdits((p) => {
      const n = { ...p };
      for (const id of ids) n[id] = { ...n[id], ...(bulk.type ? { offer_type: bulk.type } : {}), ...(bulk.model ? { revenue_model: bulk.model } : {}) };
      return n;
    });
    toast("ok", `${res.count} ${res.count === 1 ? "oferta atualizada" : "ofertas atualizadas"}.`);
    setSelected(new Set());
    setBulk({ type: "", model: "" });
    scheduleRefresh();
  }

  const count = selected.size;

  return (
    <div>
      {editable && (
        <div className={`sticky top-14 z-[5] mb-3 flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 lg:top-0 ${count ? "border-(--brand) bg-(--brand-50)" : "border-(--line) bg-white"}`}>
          <span className="text-sm font-semibold text-(--forest)">
            {count ? `${count} ${count === 1 ? "oferta marcada" : "ofertas marcadas"}` : "Marque várias ofertas para definir tipo e modelo, ou desconsiderar, de uma vez"}
          </span>
          {allIds.length > rows.length && count < allIds.length && (
            <button type="button" className="text-sm font-medium text-(--brand) underline" onClick={() => setSelected(new Set(allIds))}>Marcar as {allIds.length} filtradas</button>
          )}
          {count > 0 && (
            <>
              <button type="button" className="text-sm text-(--ink-2) underline" onClick={() => setSelected(new Set())}>Limpar seleção</button>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <select aria-label="Tipo para as marcadas" className="input !w-auto" value={bulk.type} onChange={(e) => setBulk((b) => ({ ...b, type: e.target.value }))}>
                  <option value="">Tipo…</option>
                  {OFFER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select aria-label="Modelo para as marcadas" className="input !w-auto" value={bulk.model} onChange={(e) => setBulk((b) => ({ ...b, model: e.target.value }))}>
                  <option value="">Modelo…</option>
                  {REVENUE_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <button type="button" className="btn btn-primary" disabled={applying || (!bulk.type && !bulk.model)} onClick={() => void applyBulk()}>
                  {busy === "tipo" && <Icon name="progress_activity" size={16} className="spin" />}Aplicar às {count}
                </button>
                <span className="mx-1 hidden h-6 w-px bg-(--line) sm:block" aria-hidden />
                <button type="button" className="btn" disabled={applying} title="Não apaga: a oferta só sai das próximas etapas" onClick={() => void setActive([...selected], false)}>
                  <Icon name={busy === "ativo" ? "progress_activity" : "block"} size={16} className={busy === "ativo" ? "spin" : ""} />Desconsiderar
                </button>
                <button type="button" className="btn" disabled={applying} onClick={() => void setActive([...selected], true)}>
                  <Icon name="undo" size={16} />Reconsiderar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="table-wrap">
        <table className="min-w-[56rem]">
          <thead>
            <tr>
              {editable && <th className="th w-10"><input type="checkbox" className="size-4" checked={pageAll} onChange={togglePage} aria-label="Marcar todas desta página" /></th>}
              <th className="th">ID</th><th className="th">Oferta</th><th className="th">Tipo *</th><th className="th">Modelo de receita *</th>
              <th className="th">Ticket / volume do deal</th><th className="th">Cadastro</th><th className="th col-actions"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = val(r);
              const miss = missingOfferFields({ offer_type: v.offer_type || null, revenue_model: v.revenue_model || null });
              const st = state[r.id];
              const active = isActive(r);
              const canEdit = editable && active;
              return (
                <tr key={r.id} className={`${active ? "" : "opacity-60"} ${selected.has(r.id) ? "[&>td]:!bg-(--brand-50)" : ""}`}>
                  {editable && <td className="td"><input type="checkbox" className="size-4" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Marcar ${r.name}`} /></td>}
                  <td className="td whitespace-nowrap text-(--ink-3)">{r.code ?? "—"}</td>
                  <td className="td min-w-48">
                    <Link href={`/bu/${code}/ofertas/${r.id}`} className={`font-semibold text-(--forest) hover:underline ${active ? "" : "line-through decoration-(--ink-3)"}`}>{r.name}</Link>
                    {r.description && <div className="line-clamp-1 max-w-xs text-xs text-(--ink-3)">{r.description}</div>}
                    {r.groupId && <Link href={`/bu/${code}/agrupamento/${r.groupId}`} className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-(--brand) hover:underline"><Icon name="list_alt" size={12} />{r.groupName ?? "Agrupamento"}</Link>}
                  </td>
                  <td className="td">
                    <select aria-label={`Tipo de ${r.name}`} disabled={!canEdit} className={`input !min-h-9 !w-36 ${!v.offer_type && active ? "!border-amber-400" : ""}`} value={v.offer_type} onChange={(e) => void persist(r, { offer_type: e.target.value })}>
                      <option value="">—</option>
                      {OFFER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="td">
                    <select aria-label={`Modelo de receita de ${r.name}`} disabled={!canEdit} className={`input !min-h-9 !w-40 ${!v.revenue_model && active ? "!border-amber-400" : ""}`} value={v.revenue_model} onChange={(e) => void persist(r, { revenue_model: e.target.value })}>
                      <option value="">—</option>
                      {REVENUE_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>
                  <td className="td">
                    <div className="relative w-36">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-(--ink-3)">R$</span>
                      <input
                        aria-label={`Ticket de ${r.name}`} inputMode="decimal" disabled={!canEdit} className="input !min-h-9 !pl-8 !pr-12 text-right tabular-nums"
                        placeholder={v.revenue_model === "Recorrente" ? "por mês" : v.revenue_model === "Pontual" ? "por deal" : ""}
                        value={v.ticket_medio}
                        onChange={(e) => setEdits((p) => ({ ...p, [r.id]: { ...p[r.id], ticket_medio: e.target.value } }))}
                        onBlur={() => { if ((edits[r.id]?.ticket_medio ?? null) !== null && v.ticket_medio !== (r.ticket_medio != null ? String(r.ticket_medio) : "")) void persist(r, { ticket_medio: v.ticket_medio }); }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      />
                      {v.revenue_model && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-(--ink-3)">{ticketUnit(v.revenue_model)}</span>}
                    </div>
                  </td>
                                    <td className="td whitespace-nowrap">
                    {!active ? <span className="badge bg-slate-200 text-slate-700" title="Não segue para as próximas etapas">Desconsiderada</span>
                      : st === "saving" ? <span className="badge bg-(--brand-50) text-(--ink-2)"><Icon name="progress_activity" size={14} className="spin" />Salvando</span>
                      : st === "error" ? <span className="badge bg-(--danger-100) text-(--danger)" title={errors[r.id]}><Icon name="error" size={14} />Erro ao salvar</span>
                      : miss.length === 0 ? <span className="badge bg-(--brand-100) text-(--brand-800)"><Icon name="task_alt" size={14} />Completo</span>
                      : <span className="badge bg-amber-100 text-amber-900" title={`Falta: ${miss.join(" e ")}`}><Icon name="edit" size={14} />Falta {miss.length === 2 ? "tipo e modelo" : miss[0]}</span>}
                  </td>
                  <td className="td col-actions whitespace-nowrap text-right">
                    {editable && !r.groupId && (
                      active
                        ? <button type="button" className="btn btn-sm mr-1.5 !px-2" disabled={applying} title="Desconsiderar (não apaga: a oferta só sai das próximas etapas)" aria-label={`Desconsiderar ${r.name}`} onClick={() => void setActive([r.id], false)}><Icon name="block" size={16} /></button>
                        : <button type="button" className="btn btn-sm mr-1.5 !px-2" disabled={applying} title="Reconsiderar" aria-label={`Reconsiderar ${r.name}`} onClick={() => void setActive([r.id], true)}><Icon name="undo" size={16} /></button>
                    )}
                    <Link href={`/bu/${code}/ofertas/${r.id}`} className="btn btn-sm !px-2" title="Abrir detalhe" aria-label={`Detalhe de ${r.name}`}><Icon name="edit" size={16} /></Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
