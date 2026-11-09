"use client";

import Link from "next/link";
import { useState } from "react";
import { listBuOffers, saveMmtRecord, type MmtValues } from "@/app/actions/mmt";
import { SaveIndicator, useAutosave } from "@/components/useAutosave";
import { AUDIENCES, MMT_LABEL, MMT_SPEC, PRIORITIES, PRIORITY_LABEL } from "@/lib/mmt";
import type { Bu, MmtType, Segment } from "@/lib/types";
import { Notice } from "@/components/ui";

type Offer = { id: string; code: string | null; name: string };

export function MmtForm({ id, type, regional, initial, segments, bus, initialOffers, readOnly, backHref = "/diretor", backLabel = "← Voltar aos registros" }: {
  id: string; type: MmtType; regional: string | null; initial: MmtValues; segments: Segment[]; bus: Bu[]; initialOffers: Offer[]; readOnly: boolean;
  /** para onde volta (a Diretoria volta para a página do diretor) */
  backHref?: string; backLabel?: string;
}) {
  const spec = MMT_SPEC[type];
  const [v, setV] = useState<MmtValues>(initial);
  const [offers, setOffers] = useState<Offer[]>(initialOffers);
  const { status, saveNow } = useAutosave(v, (values) => saveMmtRecord(id, values), { disabled: readOnly });
  const set = <K extends keyof MmtValues>(k: K, val: MmtValues[K]) => setV((p) => ({ ...p, [k]: val }));

  async function changeBu(buId: string) {
    setV((p) => ({ ...p, bu_id: buId, offer_id: null }));
    setOffers(await listBuOffers(buId));
  }

  // Função de render (não componente) para não perder o foco do textarea a cada tecla.
  const area = (k: "headline" | "evidence" | "reason" | "action" | "indicator", f: { label: string; hint: string; placeholder: string }, rows = 3) => (
    <div>
      <label className="label" htmlFor={`m-${k}`}>{f.label} <span className="text-(--danger)">*</span></label>
      <p className="mb-1 text-xs text-(--ink-3)">{f.hint}</p>
      <textarea id={`m-${k}`} rows={rows} maxLength={4000} disabled={readOnly} className="input" placeholder={f.placeholder}
        value={v[k]} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="sticky top-14 z-10 -mx-4 mb-5 flex items-center gap-3 border-b border-(--line) bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10">
        <h1 className="mr-auto !text-xl">{MMT_LABEL[type]}</h1>
        <SaveIndicator status={status} onRetry={() => void saveNow()} />
      </div>
      {readOnly && <Notice tone="warn">Somente leitura: período fechado ou envio concluído.</Notice>}
      <p className="text-sm text-(--ink-2)">{spec.intro} Campos com <span className="text-(--danger)">*</span> são obrigatórios para enviar.</p>

      <section className="card grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="m-segment">Segmento <span className="text-(--danger)">*</span></label>
          <select id="m-segment" className="input" disabled={readOnly} value={v.segment_id} onChange={(e) => set("segment_id", e.target.value)}>
            {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="m-bu">BU <span className="text-(--danger)">*</span></label>
          <select id="m-bu" className="input" disabled={readOnly} value={v.bu_id} onChange={(e) => void changeBu(e.target.value)}>
            {bus.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="m-offer">Oferta <span className="font-normal text-(--ink-3)">(opcional)</span></label>
          <select id="m-offer" className="input" disabled={readOnly} value={v.offer_id ?? ""} onChange={(e) => set("offer_id", e.target.value || null)}>
            <option value="">— sem oferta específica —</option>
            {offers.map((o) => <option key={o.id} value={o.id}>{o.code ? `${o.code} · ` : ""}{o.name}</option>)}
          </select>
        </div>
        <div>
          <span className="label">Regional</span>
          <div className="input bg-(--brand-50) text-(--ink-2)">{regional || "Não informada no seu perfil"}</div>
        </div>
      </section>

      <section className="card space-y-4">
        {area("headline", spec.headline)}
        {area("evidence", spec.evidence)}
        {spec.reason && area("reason", spec.reason)}
        {spec.audience && (
          <div>
            <span className="label">Público <span className="text-(--danger)">*</span></span>
            <div className="flex flex-wrap items-center gap-4">
              {AUDIENCES.map((a) => (
                <label key={a} className="flex items-center gap-1.5 text-sm">
                  <input type="radio" name="audience" disabled={readOnly} checked={v.audience === a} onChange={() => set("audience", a)} /> {a}
                </label>
              ))}
              {v.audience === "Outro" && (
                <input className="input max-w-xs" placeholder="Qual público?" maxLength={200} disabled={readOnly}
                  value={v.audience_other} onChange={(e) => set("audience_other", e.target.value)} aria-label="Qual público" />
              )}
            </div>
          </div>
        )}
        {area("action", spec.action)}
        {area("indicator", spec.indicator, 2)}
      </section>

      <section className="card">
        <span className="label">Prioridade <span className="text-(--danger)">*</span></span>
        <div className="flex gap-4">
          {PRIORITIES.map((p) => (
            <label key={p} className="flex items-center gap-1.5 text-sm">
              <input type="radio" name="priority" disabled={readOnly} checked={v.priority === p} onChange={() => set("priority", p)} /> {PRIORITY_LABEL[p]}
            </label>
          ))}
        </div>
      </section>

      <Link href={backHref} className="btn" onClick={() => void saveNow()}>{backLabel}</Link>
    </div>
  );
}
