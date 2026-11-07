import { AuthShell } from "@/components/AuthShell";
import { Flash } from "@/components/Flash";
import { setPassword } from "@/app/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Definir senha">
      <Flash ok={sp.ok} erro={sp.erro} />
      <form action={setPassword} className="space-y-3">
        <div>
          <label className="label" htmlFor="password">Nova senha (mín. 8 caracteres)</label>
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirmar senha</label>
          <input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input" />
        </div>
        <SubmitButton className="btn btn-primary w-full">Salvar senha</SubmitButton>
      </form>
    </AuthShell>
  );
}
