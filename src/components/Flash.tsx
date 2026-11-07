"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";

/**
 * Mensagens de sucesso/erro vindas das ações (?ok= / ?erro=) viram toast e saem da URL,
 * para que recarregar a página não repita o aviso.
 */
export function Flash({ ok, erro }: { ok?: string | string[]; erro?: string | string[] }) {
  const o = Array.isArray(ok) ? ok[0] : ok;
  const e = Array.isArray(erro) ? erro[0] : erro;
  return <FlashEffect ok={o} erro={e} />;
}

/** Lê ?ok= / ?erro= da URL do navegador (usado no shell, para qualquer página do sistema). */
export function FlashFromUrl() {
  const params = useSearchParams();
  return <FlashEffect ok={params.get("ok") ?? undefined} erro={params.get("erro") ?? undefined} />;
}

function FlashEffect({ ok: o, erro: e }: { ok?: string; erro?: string }) {
  const { toast } = useToast();

  useEffect(() => {
    if (!o && !e) return;
    if (e) toast("erro", e);
    else if (o) toast("ok", o);
    const url = new URL(window.location.href);
    url.searchParams.delete("ok");
    url.searchParams.delete("erro");
    window.history.replaceState(window.history.state, "", url.pathname + (url.search || ""));
  }, [o, e, toast]);

  return null;
}
