"use client";

import Link from "next/link";
import { useState } from "react";
import { saveEvaluation } from "@/app/actions/bu";
import { SaveIndicator, useAutosave } from "@/components/useAutosave";
import { Icon } from "@/components/Icon";
import { ClassBadge, Notice } from "@/components/ui";
import { classify, computeScore, isSpecialistLed, type Band, type Weights } from "@/lib/scoring";
import type { Criterion } from "@/lib/types";

interface Props {
  offerId: string;
  segmentId: string;
  offerName: string;
  segmentName: string;
  criteria: Criterion[];
  bands: Band[];
  initial: { notApplicable: boolean; notes: (number | null)[]; evidence: string[] };
  suggestion: { note: number; basis: string; average: number } | null;
  readOnly: boolean;
  pitchHref: string;
  backHref: string;
  nextHref: string | null;
}

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

export function EvaluationForm(p: Props) {
  const [notApplicable, setNotApplicable] = useState(p.initial.notApplicable);
  const [notes, setNotes] = useState<(number | null)[]>(p.initial.notes);
  const [evidence, setEvidence] = useState<string[]>(p.initial.evidence);
  const [preview, setPreview] = useState<{ crit: number; note: number } | null>(null); // rubrica exibida ao passar o mouse/focar

  const { status, saveNow } = useAutosave(
    { notApplicable, notes, evidence },
    (v) => saveEvaluation({ offerId: p.offerId, segmentId: p.segmentId, ...v }),
    { disabled: p.readOnly },
  );

  const weights = p.criteria.map((c) => c.weight) as unknown as Weights;
  const answered = notes.filter((n) => n != null).length;
  const complete = answered === notes.length;
  const score = complete ? computeScore(notes as [number, number, number, number, number], weights) : null;
  const band = score != null ? classify(score, p.bands) : null;
  const potencialMin = p.bands.find((b) => b.code === "potencial")?.min_score ?? 70;
  const specialist = score != null && isSpecialistLed(notes as [number, number, number, number, number], score, potencialMin);
  const needsPitch = !notApplicable && (band?.code === "alta" || band?.code === "potencial");

  const setNote = (i: number, n: number) => setNotes((prev) => prev.map((x, k) => (k === i ? n : x)));
  const setEv = (i: number, t: string) => setEvidence((prev) => prev.map((x, k) => (k === i ? t : x)));

  return (
    <div>
      {/* Cartão de score: fica visível enquanto a pessoa avalia */}
      <div className="sticky top-14 z-10 -mx-4 mb-5 border-b border-(--line) bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">{p.segmentName}</div>
            <h1 className="truncate !text-xl">{p.offerName}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="font-[family-name:var(--font-oswald)] text-4xl font-medium leading-none tabular-nums text-(--forest)">{notApplicable ? "N/A" : score ?? "—"}</div>
              {!notApplicable && !complete && <div className="mt-1 text-xs text-(--ink-3)">{answered} de {notes.length} critérios</div>}
            </div>
            <div className="flex flex-col items-start gap-1">
              {!notApplicable && band && <ClassBadge code={band.code} label={band.label} />}
              {specialist && !notApplicable && (
                <span className="badge bg-(--accent-100) text-(--accent-800)"><Icon name="star" size={13} />Venda liderada pelo especialista</span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex gap-1" aria-hidden>
            {notes.map((n, k) => <span key={k} className={`h-1.5 w-8 rounded-full ${n != null || notApplicable ? "bg-(--brand)" : "bg-(--line)"}`} />)}
          </div>
          <SaveIndicator status={status} onRetry={() => void saveNow()} />
        </div>
      </div>

      {p.readOnly && <Notice tone="warn" className="mb-4">Somente leitura: o período está fechado ou o envio desta BU já foi concluído.</Notice>}

      <label className="mb-5 flex w-fit cursor-pointer items-center gap-2.5 rounded-lg border border-(--line) bg-white px-3 py-2 text-sm font-medium">
        <input type="checkbox" className="size-4 accent-(--brand)" checked={notApplicable} disabled={p.readOnly} onChange={(e) => setNotApplicable(e.target.checked)} />
        Não se aplica a este segmento
      </label>

      {!notApplicable && (
        <div className="space-y-4">
          {p.criteria.map((c, i) => {
            const n = notes[i];
            const needEv = n != null && n >= 4;
            const missingEv = needEv && !evidence[i]?.trim();
            const shown = preview?.crit === i ? preview.note : n; // rubrica em foco: a prévia ou a nota escolhida
            return (
              <section key={c.id} className="card !p-5">
                <div className="mb-3 flex items-start gap-3">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${n != null ? "bg-(--brand) text-white" : "bg-(--brand-100) text-(--brand-800)"}`}>
                    {n != null ? <Icon name="check_circle" size={20} /> : c.id}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="!text-base">{c.name}</h2>
                      <span className="badge bg-(--brand-50) text-(--ink-2) ring-1 ring-(--line)">peso {c.weight}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-(--ink-2)">{c.question}</p>
                  </div>
                </div>

                <div className="mb-3 grid grid-cols-5 gap-2 sm:max-w-md" role="radiogroup" aria-label={`Nota do critério ${c.name}`}
                  onMouseLeave={() => setPreview(null)}>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={n === v}
                      aria-describedby={`rub-${c.id}`}
                      disabled={p.readOnly}
                      onClick={() => setNote(i, v)}
                      onMouseEnter={() => setPreview({ crit: i, note: v })}
                      onFocus={() => setPreview({ crit: i, note: v })}
                      onBlur={() => setPreview(null)}
                      className={`h-12 rounded-xl border-2 text-base font-bold transition-all duration-150 ${
                        n === v
                          ? "border-(--brand) bg-(--brand) text-white shadow-(--shadow-2)"
                          : "border-(--line-strong) bg-white text-(--ink-2) hover:-translate-y-px hover:border-(--brand) hover:text-(--brand)"
                      } disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0`}
                    >
                      {v}
                    </button>
                  ))}
                </div>

                <p id={`rub-${c.id}`} className={`mb-3 min-h-12 rounded-lg px-3 py-2 text-sm ${shown != null ? "bg-(--brand-50) text-(--forest)" : "text-(--ink-3)"}`} aria-live="polite">
                  {shown != null ? <><strong>Nota {shown}:</strong> {c.rubric[String(shown)]}</> : "Passe o mouse ou foque numa nota para ver a rubrica."}
                </p>

                {i === 1 && p.suggestion && (
                  <Notice tone="info" icon="target" className="mb-3">
                    <span>Sugestão pelo ticket ({p.suggestion.basis}, contra a média anual da BU de {brl(p.suggestion.average)}): nota <b>{p.suggestion.note}</b>. Ajuste se a margem pedir, com justificativa.</span>
                    {!p.readOnly && n !== p.suggestion.note && (
                      <button type="button" className="btn btn-sm ml-2 align-middle" onClick={() => setNote(1, p.suggestion!.note)}>Aplicar nota {p.suggestion.note}</button>
                    )}
                  </Notice>
                )}

                <details className="mb-3 text-sm">
                  <summary className="inline-flex cursor-pointer items-center gap-1 font-semibold text-(--brand)">
                    <Icon name="keyboard_arrow_down" size={18} />Ver rubrica completa
                  </summary>
                  <ul className="mt-2 space-y-1.5 rounded-lg bg-(--brand-50) p-3">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <li key={v} className={n === v ? "font-semibold text-(--forest)" : "text-(--ink-2)"}><b>{v}.</b> {c.rubric[String(v)]}</li>
                    ))}
                  </ul>
                </details>

                <label className="label" htmlFor={`ev-${c.id}`}>
                  Evidência / justificativa {needEv && <span className="normal-case tracking-normal text-(--danger)">· obrigatória para nota 4 e 5</span>}
                </label>
                <textarea
                  id={`ev-${c.id}`}
                  rows={2}
                  maxLength={2000}
                  value={evidence[i]}
                  disabled={p.readOnly}
                  onChange={(e) => setEv(i, e.target.value)}
                  className={`input ${missingEv ? "!border-(--danger) !ring-2 !ring-red-100" : ""}`}
                  aria-invalid={missingEv}
                />
                {missingEv && <p className="mt-1 flex items-center gap-1 text-xs font-medium text-(--danger)"><Icon name="error" size={14} />Explique o que sustenta a nota {n}.</p>}
              </section>
            );
          })}
        </div>
      )}

      {needsPitch && (
        <Notice tone="info" icon="edit" className="mt-5">
          Esta oferta é prioridade <b>{band!.code === "alta" ? "alta" : "potencial"}</b> em {p.segmentName}: o pitch desta oferta neste segmento é obrigatório.{" "}
          <Link href={p.pitchHref} className="font-semibold underline">Preencher pitch</Link>
        </Notice>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link href={p.backHref} className="btn" onClick={() => void saveNow()}><Icon name="arrow_back" size={18} />Voltar à matriz</Link>
        {p.nextHref && <Link href={p.nextHref} className="btn btn-primary" onClick={() => void saveNow()}>Próxima célula<Icon name="arrow_forward" size={18} /></Link>}
      </div>
    </div>
  );
}
