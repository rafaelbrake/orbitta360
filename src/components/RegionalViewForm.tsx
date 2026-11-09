"use client";

import { useState } from "react";
import { saveRegionalView } from "@/app/actions/mmt";
import { SaveIndicator, useAutosave } from "@/components/useAutosave";
import { isViewFilled, VIEW_MAX } from "@/lib/regional";

/** Ficha de um segmento: o que funciona e o que não funciona na região. Salva sozinha. */
export function RegionalViewForm({ segmentId, segmentName, initial, readOnly, authorId }: {
  segmentId: string; segmentName: string; initial: { works: string; not_works: string }; readOnly: boolean;
  /** a Diretoria edita em nome de um diretor */
  authorId?: string;
}) {
  const [v, setV] = useState(initial);
  const { status, saveNow } = useAutosave(v, (values) => saveRegionalView(segmentId, values, authorId), { disabled: readOnly });
  const filled = isViewFilled(v);

  return (
    <section className="card !p-5" aria-label={segmentName}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="mr-auto">{segmentName}</h2>
        <span className={`badge ${filled ? "bg-(--brand-100) text-(--brand-800)" : "bg-slate-200 text-slate-700"}`}>{filled ? "Preenchido" : "Sem visão ainda"}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor={`w-${segmentId}`}>O que funciona na minha região</label>
          <textarea id={`w-${segmentId}`} rows={5} maxLength={VIEW_MAX} disabled={readOnly} className="input" value={v.works}
            placeholder="Ofertas, abordagens, argumentos ou parceiros que dão resultado. Cite exemplos."
            onChange={(e) => setV((p) => ({ ...p, works: e.target.value }))} />
        </div>
        <div>
          <label className="label" htmlFor={`n-${segmentId}`}>O que não funciona ou precisa mudar</label>
          <textarea id={`n-${segmentId}`} rows={5} maxLength={VIEW_MAX} disabled={readOnly} className="input" value={v.not_works}
            placeholder="Onde trava: objeções, preço, concorrência, falta de preparo, oferta que não encaixa."
            onChange={(e) => setV((p) => ({ ...p, not_works: e.target.value }))} />
        </div>
      </div>
      {!readOnly && <div className="mt-2 text-right"><SaveIndicator status={status} onRetry={() => void saveNow()} /></div>}
    </section>
  );
}
