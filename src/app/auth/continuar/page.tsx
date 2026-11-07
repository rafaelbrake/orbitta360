import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { SubmitButton } from "@/components/SubmitButton";
import { confirmEmailLink } from "@/app/actions/auth";
import { parseOtpType, safeNext } from "@/lib/auth-link";

/** Passo final do link do e-mail: só o clique aqui consome o token (veja /auth/confirm). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const token_hash = typeof sp.token_hash === "string" ? sp.token_hash : "";
  const type = parseOtpType(sp.type);
  if (!token_hash || !type) redirect("/login?erro=" + encodeURIComponent("Link inválido ou expirado. Peça um novo convite ou use “Esqueci minha senha”."));
  const recovery = type === "recovery";
  return (
    <AuthShell title={recovery ? "Redefinir senha" : "Bem-vindo(a)"}>
      <p className="mb-4 text-sm text-(--ink-2)">
        {recovery ? "Clique em continuar para escolher uma nova senha." : "Seu acesso está pronto. Clique em continuar para definir a sua senha."}
      </p>
      <form action={confirmEmailLink} className="space-y-3">
        <input type="hidden" name="token_hash" value={token_hash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={safeNext(sp.next)} />
        <SubmitButton className="btn btn-primary w-full">Continuar</SubmitButton>
      </form>
    </AuthShell>
  );
}
