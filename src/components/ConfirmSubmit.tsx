"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Icon } from "@/components/Icon";

/**
 * Botão que pede confirmação antes de enviar o <form> em que está. Usa o <dialog> nativo
 * (foco preso, Esc fecha, leitor de tela anuncia como diálogo).
 */
export function ConfirmSubmit({
  children, title, message, confirmLabel = "Confirmar", danger = false, className = "btn", disabled = false,
}: {
  children: React.ReactNode; title: string; message: string; confirmLabel?: string; danger?: boolean; className?: string; disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { pending } = useFormStatus();

  return (
    <>
      <button ref={trigger} type="button" className={className} disabled={pending || disabled} aria-busy={pending} onClick={() => dialog.current?.showModal()}>
        {pending && <Icon name="progress_activity" size={16} className="spin" />}
        {children}
      </button>
      <dialog ref={dialog} className="modal m-auto w-[min(26rem,calc(100vw-2rem))]" aria-labelledby="confirm-title" onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        <div className="rounded-2xl bg-white p-5 shadow-(--shadow-3)">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${danger ? "bg-(--danger-100) text-(--danger)" : "bg-(--accent-100) text-(--accent-800)"}`}>
              <Icon name="warning" size={20} />
            </span>
            <div>
              <h2 id="confirm-title" className="!text-lg">{title}</h2>
              <p className="mt-1 text-sm text-(--ink-2)">{message}</p>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn" autoFocus onClick={() => dialog.current?.close()}>Cancelar</button>
            <button
              type="button"
              className={`btn ${danger ? "btn-danger-solid" : "btn-primary"}`}
              onClick={() => {
                dialog.current?.close();
                trigger.current?.closest("form")?.requestSubmit();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
