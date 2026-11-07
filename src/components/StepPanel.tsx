import { confirmStep } from "@/app/actions/bu";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/SubmitButton";
import { fmtDateTime } from "@/lib/format";

/**
 * Fecha uma etapa: o head confirma que concluiu e segue para a próxima. Depois de confirmada,
 * a etapa pode ser reaberta (o que bloqueia as seguintes até confirmar de novo).
 */
export function StepPanel({ code, step, confirmedAt, editable, title, doneTitle, children, confirmLabel, reopenTitle, reopenMessage, disabledReason, blocked = false }: {
  code: string; step: "offers" | "grouping"; confirmedAt: string | null; editable: boolean; title: string; doneTitle: string; children: React.ReactNode;
  confirmLabel: string; reopenTitle: string; reopenMessage: string; disabledReason?: string | null; blocked?: boolean;
}) {
  return (
    <section className={`card mt-6 !p-5 ${confirmedAt ? "" : "ring-2 ring-(--accent)"}`}>
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-full ${confirmedAt ? "bg-(--brand) text-white" : "bg-(--accent-100) text-(--accent-800)"}`}>
          <Icon name={confirmedAt ? "check_circle" : "task_alt"} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2>{confirmedAt ? doneTitle : title}</h2>
          {confirmedAt ? (
            <p className="mt-1 text-sm text-(--ink-2)">Confirmada em {fmtDateTime(confirmedAt)}.</p>
          ) : (
            <div className="mt-1 text-sm text-(--ink-2)">{children}</div>
          )}
          {editable && (
            <form action={confirmStep} className="mt-4">
              <input type="hidden" name="code" value={code} />
              <input type="hidden" name="step" value={step} />
              <input type="hidden" name="done" value={confirmedAt ? "false" : "true"} />
              {confirmedAt ? (
                <ConfirmSubmit className="btn" title={reopenTitle} message={reopenMessage} confirmLabel="Reabrir etapa">Reabrir esta etapa</ConfirmSubmit>
              ) : (
                <>
                  <SubmitButton disabled={blocked}>{confirmLabel}<Icon name="arrow_forward" size={18} /></SubmitButton>
                  {disabledReason && <p className="mt-2 text-xs text-(--danger)">{disabledReason}</p>}
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
