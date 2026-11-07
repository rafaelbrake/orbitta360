"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveResult } from "@/app/actions/bu";

export type SaveStatus = { state: "idle" | "saving" | "saved" | "error"; at?: string; error?: string };

/**
 * Salva automaticamente (debounce) sempre que o valor muda. Nunca perde o digitado:
 * salva ao sair da aba e avisa se houver alteração ainda não gravada ao fechar a página.
 */
export function useAutosave<T>(value: T, save: (v: T) => Promise<SaveResult>, opts: { delay?: number; disabled?: boolean } = {}) {
  const { delay = 800, disabled = false } = opts;
  const sig = JSON.stringify(value);
  const lastSaved = useRef(sig);
  const latest = useRef(value);
  const latestSig = useRef(sig);
  const saveRef = useRef(save);
  const [status, setStatus] = useState<SaveStatus>({ state: "idle" });

  // Mantém as refs em dia (efeito declarado antes dos demais, logo roda primeiro).
  useEffect(() => {
    latest.current = value;
    latestSig.current = sig;
    saveRef.current = save;
  });

  const run = useCallback(async () => {
    const s = latestSig.current;
    if (s === lastSaved.current) return;
    setStatus({ state: "saving" });
    try {
      const r = await saveRef.current(latest.current);
      if (r.ok) {
        lastSaved.current = s;
        setStatus(latestSig.current === s ? { state: "saved", at: r.savedAt } : { state: "saving" });
      } else {
        setStatus({ state: "error", error: r.error });
      }
    } catch {
      setStatus({ state: "error", error: "Sem conexão. Suas alterações ainda não foram salvas." });
    }
  }, []);

  useEffect(() => {
    if (disabled || sig === lastSaved.current) return;
    const t = setTimeout(run, delay);
    return () => clearTimeout(t);
  }, [sig, disabled, delay, run]);

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") void run();
    };
    const warn = (e: BeforeUnloadEvent) => {
      if (latestSig.current !== lastSaved.current && !disabled) e.preventDefault();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("beforeunload", warn);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("beforeunload", warn);
    };
  }, [run, disabled]);

  return { status, saveNow: run };
}

export function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status.state === "error")
    return (
      <span className="text-sm text-(--danger)" role="alert">
        {status.error} <button type="button" className="underline" onClick={onRetry}>Tentar novamente</button>
      </span>
    );
  if (status.state === "saving") return <span className="text-sm text-(--ink-3)">Salvando…</span>;
  if (status.state === "saved")
    return (
      <span className="text-sm text-(--brand-800)">
        Rascunho salvo às {new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(status.at!))}
      </span>
    );
  return <span className="text-sm text-(--ink-3)">Salvamento automático ativo</span>;
}
