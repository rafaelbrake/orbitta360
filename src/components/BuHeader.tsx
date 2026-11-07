import { BuStepper } from "@/components/BuStepper";
import { PageHeader, StatusBadge } from "@/components/ui";
import { STATUS_LABEL, fmtDate, statusOf, type BuSummary } from "@/lib/data";
import { waveScope, type Wave } from "@/lib/waves";
import type { Bu, BuStage, Submission } from "@/lib/types";

/** Cabeçalho das telas da BU: nome, status, prazo e as três etapas (conferir → agrupar → classificar). */
export function BuHeader({ bu, current, summary, stage, lock, submission, waves }: {
  bu: Bu; current: "ofertas" | "agrupamento" | "matriz"; summary: BuSummary; stage: BuStage; lock: boolean; submission: Submission | null; waves: Wave[];
}) {
  const entregas = waves.filter((w) => w.deadline).map((w) => `${waveScope(w)} até ${fmtDate(w.deadline).slice(0, 5)}`).join(" · ");
  const st = statusOf(submission, summary.done);
  return (
    <div>
      <PageHeader
        title={<>{bu.code} <span className="font-normal text-(--ink-3)">·</span> {bu.name}</>}
        subtitle={entregas ? `Entregas: ${entregas}` : undefined}
      >
        <StatusBadge status={st} label={STATUS_LABEL[st]} />
      </PageHeader>
      <BuStepper code={bu.code} current={current} stage={stage} summary={summary} lock={lock} submitted={submission?.status === "submitted"} />
    </div>
  );
}
