import { redirect } from "next/navigation";
import { DIRECTORS_ENABLED } from "@/lib/features";
import { ConsolidadoNav, ExportLink } from "@/components/ConsolidadoNav";
import { loadMmtRows, qp, requireConsolidated } from "@/lib/consolidated";
import { loadConfig } from "@/lib/data";
import { MMT_LABEL, MMT_TYPES, PRIORITY_LABEL, labelsOf, sortMmt } from "@/lib/mmt";
import type { MmtRow, MmtType } from "@/lib/types";
import { EmptyState } from "@/components/EmptyState";

const PRIORITY_STYLE = { alta: "bg-red-100 text-red-800", media: "bg-amber-100 text-amber-800", baixa: "bg-slate-200 text-slate-700" } as const;

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-(--ink-3)">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm">{value}</dd>
    </div>
  );
}

export default async function MmtConsolidatedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!DIRECTORS_ENABLED) redirect("/consolidado/ranking");
  const sp = await searchParams;
  const { supabase, profile } = await requireConsolidated({ adminOnly: true });
  const config = await loadConfig(supabase);
  const segmentId = qp(sp.segment);
  const buId = qp(sp.bu);
  const type = MMT_TYPES.find((t) => t === qp(sp.type));
  const rows = await loadMmtRows(supabase, config, { segmentId, buId, type });

  const qs = new URLSearchParams({ ...(segmentId ? { segment: segmentId } : {}), ...(buId ? { bu: buId } : {}), ...(type ? { type } : {}) }).toString();
  const segOrder = config.segments.map((s) => s.name);
  const groups = new Map<string, Map<string, MmtRow[]>>();
  for (const r of rows) {
    const bySeg = groups.get(r.segmentName) ?? new Map<string, MmtRow[]>();
    bySeg.set(r.buCode, [...(bySeg.get(r.buCode) ?? []), r]);
    groups.set(r.segmentName, bySeg);
  }
  const segNames = [...groups.keys()].sort((a, b) => segOrder.indexOf(a) - segOrder.indexOf(b));

  return (
    <div>
      <ConsolidadoNav current="mmt" role={profile.role} />
      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="f-seg">Segmento</label>
          <select id="f-seg" name="segment" className="input" defaultValue={segmentId ?? ""}>
            <option value="">Todos</option>
            {config.segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-bu">BU</label>
          <select id="f-bu" name="bu" className="input" defaultValue={buId ?? ""}>
            <option value="">Todas</option>
            {config.bus.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-type">Tipo</label>
          <select id="f-type" name="type" className="input" defaultValue={type ?? ""}>
            <option value="">Todos</option>
            {MMT_TYPES.map((t) => <option key={t} value={t}>{MMT_LABEL[t]}</option>)}
          </select>
        </div>
        <button className="btn btn-primary">Filtrar</button>
        <div className="ml-auto"><ExportLink href={`/consolidado/export/mmt?${qs}`} /></div>
      </form>

      <p className="mb-3 text-sm text-(--ink-2)">{rows.length} registros. Inclui rascunhos; o status de envio de cada diretor está em <strong>Progresso</strong>.</p>

      {segNames.length === 0 && <div className="card"><EmptyState icon="assignment" title="Nenhum registro para este filtro">Os registros aparecem aqui conforme os diretores preenchem.</EmptyState></div>}
      {segNames.map((seg) => (
        <section key={seg} className="mb-8">
          <h2 className="mb-3 border-b border-(--line) pb-2">{seg}</h2>
          {[...groups.get(seg)!.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([bu, list]) => (
            <div key={bu} className="mb-4">
              <h3 className="mb-2 text-sm font-semibold text-(--brand)">{bu}</h3>
              <div className="space-y-4">
                {MMT_TYPES.map((t: MmtType) => {
                  const items = sortMmt(list.filter((r) => r.type === t));
                  if (!items.length) return null;
                  const l = labelsOf(t);
                  return (
                    <div key={t}>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-(--ink-3)">{MMT_LABEL[t]} ({items.length})</div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {items.map((r) => (
                          <div key={r.id} className="card">
                            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-(--ink-2)">
                              {r.priority ? <span className={`badge ${PRIORITY_STYLE[r.priority]}`}>Prioridade {PRIORITY_LABEL[r.priority]}</span> : <span className="badge bg-slate-200 text-slate-700">Sem prioridade</span>}
                              {r.offerName && <span>{r.offerName}</span>}
                              <span className="ml-auto">{r.authorName}{r.regional ? ` · ${r.regional}` : ""}</span>
                            </div>
                            <dl className="space-y-2">
                              <Field label={l.headline} value={r.headline} />
                              <Field label={l.evidence} value={r.evidence} />
                              {l.reason && <Field label={l.reason} value={r.reason} />}
                              <Field label={l.action} value={r.action} />
                              <Field label={l.indicator} value={r.indicator} />
                              {t === "treinar" && <Field label="Público" value={r.audience === "Outro" && r.audience_other ? `Outro: ${r.audience_other}` : r.audience} />}
                            </dl>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
