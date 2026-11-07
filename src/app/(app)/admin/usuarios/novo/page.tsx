import { DIRECTORS_ENABLED } from "@/lib/features";
import { inviteUser } from "@/app/actions/admin";
import { Flash } from "@/components/Flash";
import { UserForm } from "@/components/forms/UserForm";
import { BackLink, PageHeader } from "@/components/ui";
import { loadConfig } from "@/lib/data";
import { requireProfile } from "@/lib/session";

export default async function NewUserPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requireProfile("admin");
  const config = await loadConfig(supabase);
  return (
    <div className="max-w-3xl">
      <Flash ok={sp.ok} erro={sp.erro} />
      <BackLink href="/admin/usuarios">Usuários</BackLink>
      <PageHeader title="Convidar usuário" subtitle="O convite chega por e-mail; a pessoa define a própria senha." />
      <UserForm mode="new" action={inviteUser} bus={config.bus.filter((b) => b.active)} segs={config.segments} cancelHref="/admin/usuarios" allowDirector={DIRECTORS_ENABLED} />
    </div>
  );
}
