import { Icon } from "@/components/Icon";
import { ProgressBar } from "@/components/ui";
import { fmtDate, type WaveStatus } from "@/lib/data";

export function leftLabel(left: number | null): string {
  return left == null ? "sem prazo definido" : left < 0 ? `venceu há ${-left} dia${left === -1 ? "" : "s"}` : left === 0 ? "vence hoje" : left === 1 ? "falta 1 dia" : `faltam ${left} dias`;
}

/** Uma entrega por onda: quais segmentos, prazo, quanto falta e o andamento das notas. */
export function WaveCards({ waves, unit = "avaliações" }: { waves: WaveStatus[]; unit?: string }) {
  if (waves.length === 0) return null;
  return (
    <section aria-label="Entregas por onda" className={`mb-5 grid gap-3 ${waves.length > 1 ? "md:grid-cols-2" : ""}`}>
      {waves.map((w) => {
        const late = w.left != null && w.left < 0 && w.pct < 100;
        const soon = w.left != null && w.left >= 0 && w.left <= 3 && w.pct < 100;
        return (
          <div key={w.name} className="card !p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="eyebrow">{w.name}</div>
                <h3 className="mt-0.5 text-base font-semibold text-(--forest)">{w.scope || "Sem segmentos"}</h3>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold tabular-nums text-(--forest)">Entrega até {fmtDate(w.deadline)}</div>
                <span className={`badge mt-1 ${w.pct >= 100 ? "bg-(--brand-100) text-(--brand-800)" : late ? "bg-(--danger-100) text-(--danger)" : soon ? "bg-amber-100 text-amber-900" : "bg-(--brand-50) text-(--ink-2)"}`}>
                  <Icon name={w.pct >= 100 ? "task_alt" : "schedule"} size={14} />{w.pct >= 100 ? "Completa" : leftLabel(w.left)}
                </span>
              </div>
            </div>
            <div className="mt-3"><ProgressBar done={w.done} total={w.total} unit={unit} /></div>
          </div>
        );
      })}
    </section>
  );
}
