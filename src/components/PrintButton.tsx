"use client";

import { Icon } from "@/components/Icon";

/** Abre a caixa de impressão do navegador; lá é só escolher "Salvar como PDF". */
export function PrintButton() {
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>
      <Icon name="download" size={18} />Imprimir / Salvar como PDF
    </button>
  );
}
