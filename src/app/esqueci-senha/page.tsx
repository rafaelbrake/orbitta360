import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Flash } from "@/components/Flash";
import { requestReset } from "@/app/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Redefinir senha">
      <Flash ok={sp.ok} erro={sp.erro} />
      <form action={requestReset} className="space-y-3">
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" required className="input" />
        </div>
        <SubmitButton className="btn btn-primary w-full">Enviar link</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm"><Link href="/login" className="text-(--brand) underline">Voltar</Link></p>
    </AuthShell>
  );
}
