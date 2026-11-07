"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

type Kind = "ok" | "erro" | "info";
interface ToastItem { id: number; kind: Kind; message: string }
interface Ctx { toast: (kind: Kind, message: string) => void }

const ToastCtx = createContext<Ctx>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx);

const STYLE: Record<Kind, { icon: "check_circle" | "error" | "info"; box: string; iconColor: string }> = {
  ok: { icon: "check_circle", box: "border-(--calm)", iconColor: "text-(--brand)" },
  erro: { icon: "error", box: "border-red-300", iconColor: "text-(--danger)" },
  info: { icon: "info", box: "border-(--line-strong)", iconColor: "text-(--ink-2)" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const last = useRef<{ message: string; at: number } | null>(null);
  const toast = useCallback(
    (kind: Kind, message: string) => {
      // Evita aviso duplicado (ex.: <Flash/> da página + tratamento global da URL).
      const now = Date.now();
      if (last.current && last.current.message === message && now - last.current.at < 1500) return;
      last.current = { message, at: now };
      const id = ++seq.current;
      setItems((l) => [...l.slice(-3), { id, kind, message }]);
      // Erros ficam mais tempo na tela; o usuário também pode fechar.
      setTimeout(() => dismiss(id), kind === "erro" ? 9000 : 5000);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-4 sm:items-end" aria-live="polite" aria-atomic="false">
        {items.map((t) => {
          const s = STYLE[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === "erro" ? "alert" : "status"}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white p-3 pr-2 shadow-(--shadow-2) [animation:toast-in_0.2s_var(--ease)] ${s.box}`}
            >
              <Icon name={s.icon} size={22} className={`mt-px ${s.iconColor}`} />
              <p className="flex-1 text-sm leading-snug text-(--ink)">{t.message}</p>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Fechar aviso" onClick={() => dismiss(t.id)}>
                <Icon name="close" size={18} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

/** Dispara um toast uma única vez ao montar (usado pelo <Flash/>). */
export function useToastOnce(kind: Kind, message: string | undefined) {
  const { toast } = useToast();
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!message || done.current === message) return;
    done.current = message;
    toast(kind, message);
  }, [kind, message, toast]);
}
