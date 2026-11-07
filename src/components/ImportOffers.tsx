"use client";

import Link from "next/link";
import { useActionState } from "react";
import { confirmImport, previewImport, type ImportState } from "@/app/actions/bu";
import { fmtTicket } from "@/lib/offers";
import { Notice } from "@/components/ui";

const idle: ImportState = { step: "idle" };

export function ImportOffers({ code }: { code: string }) {
  const [state, previewAction, previewing] = useActionState(previewImport, idle);
  const [done, confirmAction, confirming] = useActionState(confirmImport, idle);

  const result = done.step !== "idle" ? done : state;

  return (
    <div className="card !p-5">
      <div>
        <div className="space-y-3">
          <p className="text-sm text-(--ink-2)">
            Use o template preenchido: aba <b>1. Ofertas</b>, cabeçalho na linha 5, dados a partir da linha 7 (a linha 6, de exemplo, é ignorada).
            Nomes já cadastrados ou repetidos no arquivo são ignorados. A coluna ID é opcional: em branco, o sistema numera sozinho (OF-01, OF-02…); se vier preenchida, não pode repetir na BU. Tipo (Software, Hardware, Serviço) e modelo de receita (Recorrente, Pontual) são enquadrados nas listas padronizadas; o que for ajustado aparece na prévia. A coluna de ticket vale como valor **mensal** para ofertas Recorrentes e como **volume do deal** para as Pontuais.
          </p>
          <form action={previewAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="code" value={code} />
            <input type="file" name="file" accept=".xlsx" required className="text-sm" />
            <button className="btn" disabled={previewing}>{previewing ? "Lendo…" : "Ver prévia"}</button>
          </form>

          {result.step === "error" && <Notice tone="danger">{result.message}</Notice>}
          {result.step === "done" && (
            <Notice tone="success">
              Importação concluída: {result.inserted} oferta(s) criada(s), {result.skipped} ignorada(s).{" "}
              <Link href={`/bu/${code}/ofertas`} className="font-semibold underline">Ver as ofertas</Link>
            </Notice>
          )}
          {result.step === "preview" && (
            <>
              <p className="text-sm">
                Arquivo <b>{result.fileName}</b>: {result.rows.filter((r) => !r.issue).length} nova(s), {result.rows.filter((r) => r.issue).length} ignorada(s).
              </p>
              <div className="max-h-72 overflow-auto rounded-md border border-(--line)">
                <table className="min-w-full text-sm">
                  <thead><tr><th className="th">Linha</th><th className="th">ID</th><th className="th">Nome</th><th className="th">Tipo</th><th className="th">Modelo</th><th className="th">Ticket / volume</th><th className="th">Situação</th></tr></thead>
                  <tbody>
                    {result.rows.map((r) => (
                      <tr key={r.line} className={r.issue ? "[&>td]:bg-amber-50" : ""}>
                        <td className="td">{r.line}</td><td className="td whitespace-nowrap">{r.code ?? <span className="text-(--ink-3)">automático</span>}</td><td className="td">{r.name}</td>
                        <td className="td">{r.offer_type}</td><td className="td">{r.revenue_model}</td><td className="td">{fmtTicket(r.ticket_medio, r.revenue_model)}</td>
                        <td className="td">
                          {r.issue ? <span className="text-amber-800">⚠ {r.issue}</span> : <span className="text-(--brand-800)">Nova</span>}
                          {!r.issue && r.notes.map((n) => <div key={n} className="text-xs text-(--ink-3)">{n}</div>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <form action={confirmAction}>
                <input type="hidden" name="code" value={code} />
                <input type="hidden" name="rows" value={JSON.stringify(result.rows)} />
                <button className="btn btn-primary" disabled={confirming || result.rows.every((r) => r.issue)}>
                  {confirming ? "Gravando…" : `Importar ${result.rows.filter((r) => !r.issue).length} oferta(s)`}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
