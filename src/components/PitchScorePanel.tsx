import { ALERT_LABEL, BAND_LABEL, BAND_STYLE, CRITERIA, pointsOf, scoreBand, scoreTotal, type PitchScore } from "@/lib/pitch-score";

const BAR = ["bg-red-600", "bg-red-600", "bg-(--accent)", "bg-(--brand)"];

export interface Reevaluation { run: () => void; busy: boolean; error?: string; previousTotal?: number | null }

/** O botão só aparece quando há o que avaliar: pitch sem nota ou alterado depois dela. */
function ReevaluateButton({ r, label }: { r: Reevaluation; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn btn-primary" disabled={r.busy} onClick={r.run}>{r.busy ? "Avaliando…" : label}</button>
      {r.busy && <span className="text-sm text-(--ink-3)" role="status">Pode levar até um minuto. Dá para seguir a conversa.</span>}
      {r.error && <span className="text-sm text-(--danger)" role="alert">{r.error}</span>}
    </div>
  );
}

/** Nota do pitch na tela da oferta em Foco: total, os seis critérios com o porquê, alertas, melhorias e a régua. */
export function PitchScorePanel({ score, reevaluation }: { score: PitchScore | null; reevaluation?: Reevaluation }) {
  if (!score) {
    return (
      <div className="space-y-2 rounded-xl border border-dashed border-(--line-strong) px-4 py-3 text-base text-(--ink-3)">
        <p>Este pitch ainda não foi avaliado.</p>
        {reevaluation && <ReevaluateButton r={reevaluation} label="Avaliar nota" />}
      </div>
    );
  }
  const total = scoreTotal(score.levels);
  const band = scoreBand(total, score.alerts);
  const [y, m, d] = score.evaluatedAt.slice(0, 10).split("-");
  return (
    <section aria-label="Nota do pitch" className="space-y-4 rounded-2xl border border-(--line) p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-5xl font-semibold tabular-nums leading-none text-(--forest)">{total}</span>
        <span className="text-lg text-(--ink-3)">de 100 · nota do pitch</span>
        <span className={`badge !text-base ${BAND_STYLE[band]}`}>{BAND_LABEL[band]}</span>
        {total >= 80 && score.alerts.length > 0 && <span className="text-sm text-(--ink-3)">A nota daria pronto, mas há alerta a resolver.</span>}
      </div>
      {score.stale && <p className="rounded-xl bg-amber-50 px-4 py-2 text-base font-semibold text-amber-900">O pitch mudou depois desta avaliação: a nota é do texto anterior.</p>}
      {score.stale && reevaluation && <ReevaluateButton r={reevaluation} label="Reavaliar nota" />}
      {!score.stale && reevaluation?.previousTotal != null && <p className="text-lg font-semibold text-(--forest)" role="status">Antes {reevaluation.previousTotal} → agora {total}</p>}
      <ul className="grid gap-x-6 gap-y-3 md:grid-cols-2">
        {CRITERIA.map((c) => {
          const level = score.levels[c.key];
          const pts = pointsOf(c.key, level);
          return (
            <li key={c.key}>
              <div className="flex items-baseline justify-between gap-2"><b className="text-base text-(--forest)">{c.label}</b><span className="tabular-nums text-sm text-(--ink-2)">{pts} de {c.max}</span></div>
              <div className="mt-1 h-2 rounded-full bg-(--line)" aria-hidden="true"><div className={`h-2 rounded-full ${BAR[level]}`} style={{ width: `${(pts / c.max) * 100}%` }} /></div>
              {score.reasons[c.key] && <p className="mt-1 text-base leading-snug text-(--ink-2)">{score.reasons[c.key]}</p>}
            </li>
          );
        })}
      </ul>
      {score.alerts.length > 0 && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-900">
          <b>{score.alerts.length === 1 ? "1 alerta" : `${score.alerts.length} alertas`}</b>
          <ul className="mt-1 space-y-1">{score.alerts.map((a, i) => <li key={i}><span className="font-semibold">{ALERT_LABEL[a.tipo]}:</span> {a.texto}</li>)}</ul>
        </div>
      )}
      {score.improvements.length > 0 && (
        <div><b className="text-base text-(--forest)">O que melhorar</b><ol className="ml-5 mt-1 list-decimal space-y-1 text-lg leading-snug">{score.improvements.map((x, i) => <li key={i}>{x}</li>)}</ol></div>
      )}
      <details className="text-sm text-(--ink-2)">
        <summary className="cursor-pointer font-semibold text-(--forest)">Como a nota é calculada</summary>
        <div className="mt-2 space-y-2">
          {CRITERIA.map((c) => (
            <div key={c.key}><b>{c.label} ({c.max}):</b> {c.levels.map((t, i) => `${pointsOf(c.key, i as 0 | 1 | 2 | 3)} = ${t}`).reverse().join(" · ")}</div>
          ))}
          <p>80 ou mais: pronto para o vendedor · 60 a 79: ajustar · abaixo de 60: refazer. Alerta não tira ponto, mas impede o “pronto”.</p>
        </div>
      </details>
      <p className="text-xs text-(--ink-3)">Avaliação feita por IA ({score.evaluator}) em {d}/{m}/{y}. É apoio à conversa: a decisão é da sala.</p>
    </section>
  );
}
