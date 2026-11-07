import { DIRECTORS_ENABLED } from "@/lib/features";
import { notFound } from "next/navigation";
import { updateUser } from "@/app/actions/admin";
import { Flash } from "@/components/Flash";
import { UserForm } from "@/components/forms/UserForm";
import { BackLink, PageHeader } from "@/components/ui";
import { loadConfig } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import type { Profile } from "@/lib/types";

export default async function UserDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, profile: me } = await requireProfile("admin");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [config, u, ub, us] = await Promise.all([
    loadConfig(supabase),
    supabase.from("profiles").select("*").eq("id", id).maybeSingle<Profile>(),
    supabase.from("user_bus").select("bu_id").eq("user_id", id),
    supabase.from("user_segments").select("segment_id").eq("user_id", id),
  ]);
  if (!u.data) notFound();
  const user = u.data;

  return (
    <div className="max-w-3xl">
      <Flash ok={sp.ok} erro={sp.erro} />
      <BackLink href="/admin/usuarios">Usuários</BackLink>
      <PageHeader
        title={user.full_name || user.email}
        subtitle={user.id === me.id ? "Este é o seu usuário: você não pode rebaixar nem desativar o próprio acesso." : user.email}
      >
        <span className={`badge ${user.active ? "bg-(--brand-100) text-(--brand-800)" : "bg-slate-200 text-slate-700"}`}>{user.active ? "Ativo" : "Inativo"}</span>
      </PageHeader>
      <UserForm
        mode="edit"
        action={updateUser}
        user={user}
        bus={config.bus.filter((b) => b.active)}
        segs={config.segments}
        buIds={(ub.data ?? []).map((r) => r.bu_id as string)}
        segIds={(us.data ?? []).map((r) => r.segment_id as string)}
        cancelHref="/admin/usuarios"
        allowDirector={DIRECTORS_ENABLED}
      />
    </div>
  );
}
