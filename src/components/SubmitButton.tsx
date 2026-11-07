"use client";

import { useFormStatus } from "react-dom";
import { Icon } from "@/components/Icon";

/** Botão de envio de <form action>: desabilita e mostra carregamento enquanto a ação roda (evita duplo clique). */
export function SubmitButton({ children, className = "btn btn-primary", pendingLabel, disabled = false }: { children: React.ReactNode; className?: string; pendingLabel?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending && <Icon name="progress_activity" size={16} className="spin" />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
