"use client";

import Link from "next/link";
import { useState } from "react";
import { setPriority, setPriorityNote } from "@/app/actions/segment";
import { Icon } from "@/components/Icon";
import { ClassBadge } from "@/components/ui";
import { LEVELS, LEVEL_LABEL, LEVEL_STYLE, suggestedLevel, type Level } from "@/lib/segment";

export interface PriorityRow {
  offerId: string; code: string | null; name: string; buCode: string; score: number; classCode: string; classLabel: string;
  hasPitch: boolean; leaderPitch: boolean; signals: { regional: string; type: string }[];
}
type Filter = "todas" | Level | "sem";
const SIGNAL_STYLE: Record<string, string> = { manter: "bg-(--brand-100) text-(--brand-800)", mudar: "bg-(--accent-100) text-(--accent-800)", treinar: "bg-slate-200 text-slate-700" };
const SIGNAL_LABEL: Record<string, string> = { manter: "Manter", mudar: "Mudar", treinar: "Treinar" };

/** Ranking do segmento (todas as BUs) com o nível de cada oferta. Cada mudança é salva na hora; o limite de Foco é conferido pelo banco. */
export function PriorityTable({ segmentId, rows, initialLevels, initialNotes, focoLimit, readOnly }: {
  segmentId: string; rows: PriorityRow[]; initialLevels: Record<string, Level>; initialNotes: Record<string, string>; focoLimit: number; readOnly: boolean;
}) {
  const [levels, setLevels] = useState<Record<string, Level | undefined>>(initialLevels);
  const [notes, setNotes] = useState<Record<string, string>>(initialNotes);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("todas");

  const count = (l: Level) => rows.filter((r) => levels[r.offerId] === l).length;
  const semNivel = rows.filter((r) => !levels[r.offerId]).length;
  const visible = rows.filter((r) => (filter === "todas" ? true : filter === "sem" ? !levels[r.offerId] : levels[r.offerId] === filter));

  async function change(r: PriorityRow, next: string) {
    const level = (next || null) as Level | null;
    const prev = levels[r.offerId];
    setBusy(r.offerId);
    setErrors((e) => { const n = { ...e }; delete n[r.offerId]; return n; });
    setLevels((l) => ({ ...l, [r.offerId]: level ?? undefined }));
    const res = await setPriority(segmentId, r.offerId, level);
    setBusy(null);
    if (!res.ok) {
      setLevels((l) => ({ ...l, [r.offerId]: prev }));
      setErrors((e) => ({ ...e, [r.offerId]: res.error }));
    }
  }

  async function saveNote(r: PriorityRow) {
    if (!levels[r.offerId]) return;
    const res = await setPriorityNote(segmentId, r.offerId, notes[r.offerId] ?? "");
    if (!res.ok) setErrors((e) => ({ ...e, [r.offerId]: res.error }));
  }

  const chip = (f: Filter, label: string, n: number) => (
    <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
      className={`rounded-full border px-3 py-1 text-sm font-medium ${filter === f ? "border-(--brand) bg-(--brand-50) text-(--forest)" : "border-(--line) bg-white text-(--ink-2) hover:border-(--line-strong)"}`}>
      {label} <span className="tabular-nums text-(--ink-3)">{n}</span>
    </button>
  );
  const focoFull = count("foco") >= focoLimit;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {chip("todas", "Todas", rows.length)}{chip("foco", "Foco", count("foco"))}{chip("apoio", "Apoio", count("apoio"))}{chip("fora", "Fora do radar", count("fora"))}{chip("sem", "Sem nível", semNivel)}
        <span className={`ml-auto badge ${focoFull ? "bg-(--accent-100) text-(--accent-800)" : "bg-(--brand-50) text-(--ink-2)"}`}>
          <Icon name="target" size={14} />Foco: {count("foco")} de {focoLimit}
        </span>
      </div>

      <div className="table-wrap">
        <table className="min-w-[60rem]">
          <thead><tr>
            <th className="th w-10">#</th><th className="th">Oferta</th><th className="th">BU</th><th className="th">Nota (heads)</th><th className="th">Pitch</th>
            <th className="th">O que disseram as regionais</th><th className="th">Nível</th><th className="th">Por quê (opcional)</th>
          </tr></thead>
          <tbody>
            {visible.map((r) => {
              const lvl = levels[r.offerId];
              const sug = suggestedLevel(r.classCode);
              return (
                <tr key={r.offerId}>
                  <td className="td tabular-nums text-(--ink-3)">{rows.indexOf(r) + 1}</td>
                  <td className="td min-w-48"><div className="font-semibold text-(--forest)">{r.name}</div>{r.code && <div className="text-xs text-(--ink-3)">{r.code}</div>}</td>
                  <td className="td whitespace-nowrap text-sm font-medium">{r.buCode}</td>
                  <td className="td whitespace-nowrap"><span className="mr-1.5 font-semibold tabular-nums">{r.score}</span><ClassBadge code={r.classCode} label={r.classLabel} /></td>
                  <td className="td whitespace-nowrap text-sm">
                    <Link href={`/segmento/${segmentId}/pitch/${r.offerId}`} className="font-medium text-(--brand) underline-offset-2 hover:underline">
                      {readOnly ? "Ver pitch" : r.leaderPitch ? "Pitch do segmento · editar" : r.hasPitch ? "Pitch do head · editar" : "Escrever pitch"}
                    </Link>
                  </td>
                  <td className="td">
                    <div className="flex max-w-56 flex-wrap gap-1">
                      {r.signals.length === 0 ? <span className="text-xs text-(--ink-3)">—</span> : r.signals.map((s, i) => (
                        <span key={i} className={`badge !text-[11px] ${SIGNAL_STYLE[s.type] ?? ""}`} title={`${s.regional}: ${SIGNAL_LABEL[s.type] ?? s.type}`}>{s.regional} · {SIGNAL_LABEL[s.type] ?? s.type}</span>
                      ))}
                    </div>
                  </td>
                  <td className="td">
                    <select aria-label={`Nível de ${r.name}`} disabled={readOnly || busy === r.offerId} value={lvl ?? ""} onChange={(e) => void change(r, e.target.value)}
                      className={`input !min-h-9 !w-36 ${lvl ? `!border-transparent font-semibold ${LEVEL_STYLE[lvl]}` : ""}`}>
                      <option value="">Sem nível</option>
                      {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
                    </select>
                    {!lvl && !readOnly && <div className="mt-0.5 text-[11px] text-(--ink-3)">sugestão: {LEVEL_LABEL[sug]}</div>}
                    {errors[r.offerId] && <div className="mt-1 max-w-48 text-xs text-(--danger)" role="alert">{errors[r.offerId]}</div>}
                  </td>
                  <td className="td min-w-48">
                    <input aria-label={`Por quê, ${r.name}`} maxLength={300} disabled={readOnly || !lvl} className="input !min-h-9" placeholder={lvl ? "Uma frase" : "Defina o nível"}
                      value={notes[r.offerId] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.offerId]: e.target.value }))} onBlur={() => void saveNote(r)} />
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && <tr><td className="td py-8 text-center text-sm text-(--ink-3)" colSpan={8}>Nenhuma oferta neste filtro.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
