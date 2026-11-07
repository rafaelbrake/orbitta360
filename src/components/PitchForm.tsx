"use client";

import Link from "next/link";
import { useState } from "react";
import { savePitch } from "@/app/actions/bu";
import { Icon } from "@/components/Icon";
import { SaveIndicator, useAutosave } from "@/components/useAutosave";
import { Notice } from "@/components/ui";
import { REVENUE_MODELS, ticketHint, ticketLabel } from "@/lib/offers";
import { emptyCase, MAX_CASES, missingPitchFields, REQUIRED_PITCH, type PitchCase } from "@/lib/pitch";

/** Valores editáveis da ficha (tudo texto no formulário; o servidor valida e converte). */
export interface PitchValues {
  descricao: string; dores: string; proposta_valor: string; pitch_abertura: string;
  pergunta_1: string; pergunta_2: string; pergunta_3: string;
  cases: PitchCase[];
  perfil_cliente: string; persona_decisora: string; persona_influenciadora: string;
  funcionarios_min: string; funcionarios_max: string;
  modelo_receita: string; ticket_medio: string;
}

const REQUIRED_KEYS = new Set<string>(REQUIRED_PITCH.map(([k]) => k));

export function PitchForm({ offerId, segmentId, offerName, segmentName, classLabel, initial, prefilled, readOnly, backHref }: {
  offerId: string; segmentId: string; offerName: string; segmentName: string; classLabel: string | null;
  initial: PitchValues; prefilled: boolean; readOnly: boolean; backHref: string;
}) {
  const [v, setV] = useState<PitchValues>(initial);
  const { status, saveNow } = useAutosave(v, (values) => savePitch({ offerId, segmentId, values }), { disabled: readOnly });
  const set = <K extends keyof PitchValues>(k: K, val: PitchValues[K]) => setV((prev) => ({ ...prev, [k]: val }));
  const missing = missingPitchFields(v);
  const total = REQUIRED_PITCH.length;

  const setCase = (i: number, k: keyof PitchCase, val: string) =>
    setV((prev) => ({ ...prev, cases: prev.cases.map((c, idx) => (idx === i ? { ...c, [k]: val } : c)) }));

  // Função de render (não componente): evita remontar o campo a cada tecla e perder o foco.
  const area = (k: Exclude<keyof PitchValues, "cases">, label: string, rows = 3, hint?: string) => (
    <div>
      <label className="label" htmlFor={`f-${k}`}>{label}{REQUIRED_KEYS.has(k) && <span className="text-(--danger)"> *</span>}</label>
      <textarea id={`f-${k}`} rows={rows} maxLength={4000} disabled={readOnly} className="input" value={v[k] as string} onChange={(e) => set(k, e.target.value as never)} />
      {hint && <p className="mt-1 text-xs text-(--ink-3)">{hint}</p>}
    </div>
  );
  const line = (k: Exclude<keyof PitchValues, "cases">, label: string, placeholder?: string, hint?: string) => (
    <div>
      <label className="label" htmlFor={`f-${k}`}>{label}{REQUIRED_KEYS.has(k) && <span className="text-(--danger)"> *</span>}</label>
      <input id={`f-${k}`} maxLength={300} disabled={readOnly} className="input" placeholder={placeholder} value={v[k] as string} onChange={(e) => set(k, e.target.value as never)} />
      {hint && <p className="mt-1 text-xs text-(--ink-3)">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="sticky top-14 z-10 -mx-4 mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-(--line) bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10">
        <div className="mr-auto min-w-0">
          <div className="eyebrow">Pitch · {segmentName}{classLabel ? ` · ${classLabel}` : ""}</div>
          <h1 className="truncate !text-xl">{offerName}</h1>
        </div>
        <span className={`badge ${missing.length === 0 ? "bg-(--brand-100) text-(--brand-800)" : "bg-amber-100 text-amber-900"}`} title={missing.length ? `Faltam: ${missing.join(", ")}` : undefined}>
          <Icon name={missing.length === 0 ? "task_alt" : "edit"} size={14} />
          {total - missing.length} de {total} obrigatórios
        </span>
        <SaveIndicator status={status} onRetry={() => void saveNow()} />
      </div>
      {readOnly && <Notice tone="warn">Somente leitura: período fechado ou envio concluído.</Notice>}
      <p className="text-sm text-(--ink-2)">
        Campos com <span className="text-(--danger)">*</span> são obrigatórios para enviar: esta oferta está em prioridade alta ou potencial neste segmento. Cada oferta tem o seu pitch em cada segmento.
      </p>

      <section className="card space-y-4 !p-5">
        {area("descricao", "Descrição da oferta", 3, prefilled ? "Veio da descrição cadastrada da oferta. Ajuste se quiser adaptar a este segmento." : undefined)}
        {area("dores", "Principais dores do segmento")}
        {area("proposta_valor", "Proposta de valor")}
        {area("pitch_abertura", "Pitch de abertura para o AM")}
      </section>

      <section className="card space-y-4 !p-5">
        <h2>Perguntas de descoberta</h2>
        {area("pergunta_1", "Pergunta 1", 2)}
        {area("pergunta_2", "Pergunta 2", 2)}
        {area("pergunta_3", "Pergunta 3", 2)}
      </section>

      <section className="card !p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2>Cases de sucesso</h2>
          <span className="text-sm text-(--ink-3)">{v.cases.length === 0 ? "Nenhum case ainda" : `${v.cases.length} ${v.cases.length === 1 ? "case" : "cases"}`}</span>
          {!readOnly && (
            <button type="button" className="btn btn-sm ml-auto" disabled={v.cases.length >= MAX_CASES} onClick={() => set("cases", [...v.cases, emptyCase()])}>
              <Icon name="add" size={16} />Adicionar case
            </button>
          )}
        </div>
        {v.cases.length === 0 ? (
          <p className="rounded-lg bg-(--brand-50) px-3 py-4 text-center text-sm text-(--ink-3)">
            Inclua um ou mais cases que comprovem resultados neste segmento. Opcional.
          </p>
        ) : (
          <ol className="space-y-3">
            {v.cases.map((c, i) => (
              <li key={i} className="rounded-xl border border-(--line) bg-(--brand-50) p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-full bg-(--brand) text-xs font-bold text-white">{i + 1}</span>
                  <span className="text-sm font-semibold text-(--forest)">Case {i + 1}</span>
                  {!readOnly && (
                    <button type="button" className="btn btn-danger btn-sm ml-auto" onClick={() => set("cases", v.cases.filter((_, idx) => idx !== i))} aria-label={`Remover case ${i + 1}`}>
                      <Icon name="delete" size={16} />Remover
                    </button>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="label" htmlFor={`case-${i}-cliente`}>Cliente</label>
                    <input id={`case-${i}-cliente`} maxLength={200} disabled={readOnly} className="input bg-white" value={c.cliente} onChange={(e) => setCase(i, "cliente", e.target.value)} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`case-${i}-desafio`}>Desafio</label>
                    <textarea id={`case-${i}-desafio`} rows={2} maxLength={2000} disabled={readOnly} className="input bg-white" value={c.desafio} onChange={(e) => setCase(i, "desafio", e.target.value)} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`case-${i}-solucao`}>Solução</label>
                    <textarea id={`case-${i}-solucao`} rows={2} maxLength={2000} disabled={readOnly} className="input bg-white" value={c.solucao} onChange={(e) => setCase(i, "solucao", e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label" htmlFor={`case-${i}-resultado`}>Resultado</label>
                    <textarea id={`case-${i}-resultado`} rows={2} maxLength={2000} disabled={readOnly} className="input bg-white" value={c.resultado} onChange={(e) => setCase(i, "resultado", e.target.value)} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card !p-5">
        <h2 className="mb-1">Perfil ideal de cliente</h2>
        <p className="mb-4 text-sm text-(--ink-3)">Quem é o cliente e quem decide: quanto mais específico, melhor o Account Manager encontra a conta certa.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {line("perfil_cliente", "Perfil de cliente / sub-segmento", "Ex.: Hospitais, Clínicas")}
          {line("persona_decisora", "Persona decisora", "Ex.: Diretor de TI, CIO")}
          {line("persona_influenciadora", "Persona influenciadora", "Ex.: Diretor de Marketing")}
          <div>
            <span className="label">Quantidade de funcionários</span>
            <div className="flex items-center gap-2">
              <input inputMode="numeric" aria-label="Funcionários: de" placeholder="De" disabled={readOnly} className="input" value={v.funcionarios_min} onChange={(e) => set("funcionarios_min", e.target.value)} />
              <span className="text-sm text-(--ink-3)">a</span>
              <input inputMode="numeric" aria-label="Funcionários: até" placeholder="Até" disabled={readOnly} className="input" value={v.funcionarios_max} onChange={(e) => set("funcionarios_max", e.target.value)} />
            </div>
            <p className="mt-1 text-xs text-(--ink-3)">Faixa de porte do cliente. Pode preencher só um dos lados.</p>
          </div>
          <div>
            <label className="label" htmlFor="f-modelo_receita">Modelo de receita</label>
            <select id="f-modelo_receita" disabled={readOnly} className="input" value={v.modelo_receita} onChange={(e) => set("modelo_receita", e.target.value)}>
              <option value="">Selecione…</option>
              {REVENUE_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-ticket_medio">{ticketLabel(v.modelo_receita)}</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-(--ink-3)">R$</span>
              <input id="f-ticket_medio" inputMode="decimal" disabled={readOnly} className="input !pl-10" value={v.ticket_medio} onChange={(e) => set("ticket_medio", e.target.value)} />
            </div>
            <p className="mt-1 text-xs text-(--ink-3)">{ticketHint(v.modelo_receita)}</p>
          </div>
        </div>
      </section>

      <Link href={backHref} className="btn" onClick={() => void saveNow()}><Icon name="arrow_back" size={18} />Voltar à matriz</Link>
    </div>
  );
}
