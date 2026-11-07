import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Flash } from "@/components/Flash";
import { signIn } from "@/app/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Entrar">
      <Flash ok={sp.ok} erro={sp.erro} />
      <form action={signIn} className="space-y-3">
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" required autoComplete="username" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Senha</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
        </div>
        <SubmitButton className="btn btn-primary w-full" pendingLabel="Entrando…">Entrar</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link href="/esqueci-senha" className="text-(--brand) underline">Esqueci minha senha</Link>
      </p>
    </AuthShell>
  );
}
