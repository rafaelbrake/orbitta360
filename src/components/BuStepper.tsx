import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { BuSummary } from "@/lib/data";
import type { BuStage } from "@/lib/types";

type Key = "ofertas" | "agrupamento" | "matriz";

/**
 * As três etapas da BU, em sequência: 1) conferir as ofertas, 2) agrupar as semelhantes, 3) classificar.
 * Head só avança depois de concluir a anterior (`lock`); a Diretoria Corporativa navega livremente.
 */
export function BuStepper({ code, current, stage, summary, lock, submitted }: {
  code: string; current: Key; stage: BuStage; summary: BuSummary; lock: boolean; submitted: boolean;
}) {
  const steps: { key: Key; n: number; title: string; href: string; done: boolean; locked: boolean; detail: string }[] = [
    {
      key: "ofertas", n: 1, title: "Conferir as ofertas", href: `/bu/${code}/ofertas`,
      done: !!stage.offersConfirmedAt, locked: false,
      detail: `${summary.originals} ${summary.originals === 1 ? "oferta cadastrada" : "ofertas cadastradas"}`,
    },
    {
      key: "agrupamento", n: 2, title: "Agrupar as semelhantes", href: `/bu/${code}/agrupamento`,
      done: !!stage.groupingConfirmedAt, locked: lock && !stage.offersConfirmedAt,
      detail: summary.groups ? `${summary.groups} ${summary.groups === 1 ? "agrupamento" : "agrupamentos"} · ${summary.grouped} ofertas` : "Nenhum agrupamento",
    },
    {
      key: "matriz", n: 3, title: "Classificar", href: `/bu/${code}`,
      done: submitted, locked: lock && !stage.groupingConfirmedAt,
      detail: `${summary.done} de ${summary.total} células`,
    },
  ];

  return (
    <nav aria-label="Etapas da BU" className="mb-6">
      <ol className="grid gap-3 xl:grid-cols-3">
        {steps.map((s) => {
          const isCurrent = s.key === current;
          const body = (
            <>
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${
                  s.done ? "bg-(--brand) text-white" : s.locked ? "bg-(--line) text-(--ink-3)" : isCurrent ? "bg-(--accent) text-(--forest)" : "bg-(--brand-100) text-(--brand-800)"
                }`}
              >
                {s.done ? <Icon name="check_circle" size={22} /> : s.n}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${s.locked ? "text-(--ink-3)" : "text-(--forest)"}`}>{s.title}</span>
                <span className="block truncate text-xs text-(--ink-3)">
                  {s.locked ? "Conclua a etapa anterior" : s.detail}
                </span>
              </span>
              <span className="ml-auto self-start">
                {s.done ? <span className="badge bg-(--brand-100) text-(--brand-800)">Concluída</span>
                  : s.locked ? <span className="badge bg-(--line) text-(--ink-3)">Bloqueada</span>
                  : isCurrent ? <span className="badge bg-(--accent-100) text-(--accent-800)">Você está aqui</span>
                  : <span className="badge bg-(--brand-50) text-(--ink-2) ring-1 ring-(--line)">Pendente</span>}
              </span>
            </>
          );
          const cls = `card flex items-center gap-3 !p-3.5 ${isCurrent ? "ring-2 ring-(--accent)" : ""} ${s.locked ? "opacity-80" : "card-interactive"}`;
          return (
            <li key={s.key}>
              {s.locked ? (
                <div className={cls} aria-disabled="true">{body}</div>
              ) : (
                <Link href={s.href} className={cls} aria-current={isCurrent ? "step" : undefined}>{body}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
