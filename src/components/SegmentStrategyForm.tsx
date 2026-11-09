"use client";

import { useEffect, useState } from "react";
import { saveStrategy } from "@/app/actions/segment";
import { SaveIndicator, useAutosave } from "@/components/useAutosave";

/** Tese do segmento e mensagem aos vendedores. Salva sozinha. */
export function SegmentStrategyForm({ segmentId, initial, readOnly, onChange }: { segmentId: string; initial: { thesis: string; message: string }; readOnly: boolean; onChange?: (v: { thesis: string; message: string }) => void }) {
  const [v, setV] = useState(initial);
  useEffect(() => { onChange?.(v); }, [v, onChange]);
  const { status, saveNow } = useAutosave(v, (values) => saveStrategy(segmentId, values), { disabled: readOnly });
  return (
    <section className="card !p-5" aria-label="Estratégia do segmento">
      <h2 className="mb-1">Estratégia do segmento</h2>
      <p className="mb-4 text-sm text-(--ink-3)">Foco claro: poucas ofertas, bem explicadas. É isto que o vendedor lê primeiro no book.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="st-thesis">Tese: onde vamos focar e por quê</label>
          <textarea id="st-thesis" rows={5} maxLength={4000} disabled={readOnly} className="input" value={v.thesis}
            placeholder="Em 3 a 5 linhas: o que o segmento vai priorizar em 2027 e o que ficou de fora."
            onChange={(e) => setV((p) => ({ ...p, thesis: e.target.value }))} />
        </div>
        <div>
          <label className="label" htmlFor="st-message">Mensagem aos vendedores</label>
          <textarea id="st-message" rows={5} maxLength={4000} disabled={readOnly} className="input" value={v.message}
            placeholder="O que o vendedor precisa entender e fazer: como abrir a conversa, o que nunca esquecer."
            onChange={(e) => setV((p) => ({ ...p, message: e.target.value }))} />
        </div>
      </div>
      {!readOnly && <div className="mt-2 text-right"><SaveIndicator status={status} onRetry={() => void saveNow()} /></div>}
    </section>
  );
}
