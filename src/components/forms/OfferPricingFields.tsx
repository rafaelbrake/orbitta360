"use client";

import { useState } from "react";
import { OFFER_TYPES, REVENUE_MODELS, ticketHint, ticketLabel } from "@/lib/offers";
import type { Offer } from "@/lib/types";

const BCG = ["Estrela", "Vaca leiteira", "Interrogação", "Abacaxi"];

/**
 * Tipo, modelo de receita, ticket e BCG de uma oferta. O rótulo e a ajuda do ticket mudam com o modelo:
 * recorrente → valor mensal; pontual → volume do deal (o campo gravado é o mesmo).
 */
export function OfferPricingFields({ offer, disabled }: { offer?: Offer; disabled: boolean }) {
  const [model, setModel] = useState<string>(offer?.revenue_model ?? "");

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <div>
        <label className="label" htmlFor="o-type">Tipo *</label>
        <select id="o-type" name="offer_type" required defaultValue={offer?.offer_type ?? ""} disabled={disabled} className="input">
          <option value="" disabled>Selecione…</option>
          {OFFER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="o-rev">Modelo de receita *</label>
        <select id="o-rev" name="revenue_model" required value={model} onChange={(e) => setModel(e.target.value)} disabled={disabled} className="input">
          <option value="" disabled>Selecione…</option>
          {REVENUE_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="md:col-span-2">
        <label className="label" htmlFor="o-ticket">{ticketLabel(model)}</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-(--ink-3)">R$</span>
          <input id="o-ticket" name="ticket_medio" inputMode="decimal" defaultValue={offer?.ticket_medio ?? ""} disabled={disabled} className="input !pl-10" />
        </div>
        <p className="mt-1 text-xs text-(--ink-3)" aria-live="polite">{ticketHint(model)}</p>
      </div>
      <div>
        <label className="label" htmlFor="o-bcg">Quadrante BCG</label>
        <select id="o-bcg" name="bcg" defaultValue={offer?.bcg ?? ""} disabled={disabled} className="input">
          <option value="">—</option>
          {BCG.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
    </div>
  );
}
