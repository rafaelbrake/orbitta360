"use client";

import { useState } from "react";
import type { BuOption } from "@/components/forms/OfferForm";

/**
 * BU e ID da oferta. A BU é escolhida entre as cadastradas (só no cadastro novo). O ID é gerado pelo sistema:
 * no cadastro novo aparece o próximo número da BU escolhida; depois de criado, o ID não muda.
 */
export function OfferIdFields({ mode, lockBu, buOptions, buId, offerCode, nextCodes }: {
  mode: "new" | "edit"; lockBu: boolean; buOptions: BuOption[]; buId: string; offerCode: string | null;
  nextCodes: Record<string, string>;
}) {
  const [bu, setBu] = useState(buId);
  const editable = mode === "new" && !lockBu;
  const code = mode === "new" ? (nextCodes[bu] ?? "") : (offerCode ?? "—");
  return (
    <>
      <div className="md:col-span-2">
        <label className="label" htmlFor="o-bu">BU *</label>
        {editable ? (
          <select id="o-bu" name="bu_id" required value={bu} onChange={(e) => setBu(e.target.value)} className="input">
            {buOptions.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
          </select>
        ) : (
          <>
            <select id="o-bu" disabled defaultValue={buId} className="input">
              {buOptions.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
            </select>
            <p className="mt-1 text-xs text-(--ink-3)">{lockBu ? "O agrupamento fica na BU das ofertas escolhidas." : "A BU não muda depois do cadastro."}</p>
          </>
        )}
      </div>
      <div>
        <label className="label" htmlFor="o-code">ID</label>
        <input id="o-code" value={code} readOnly tabIndex={-1} aria-describedby="o-code-hint" title={mode === "new" ? "Gerado automaticamente ao salvar" : "Gerado pelo sistema; não muda"} className="input bg-(--brand-50) font-semibold text-(--ink-2)" />
        <p id="o-code-hint" className="mt-1 text-xs text-(--ink-3)">{mode === "new" ? "Automático" : "Não muda"}</p>
      </div>
    </>
  );
}
