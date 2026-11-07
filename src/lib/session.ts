import { redirect } from "next/navigation";
import { DIRECTORS_ENABLED } from "@/lib/features";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

/** Usuário logado + perfil. Sem sessão → /login. */
export async function requireProfile(...roles: Role[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,regional,active,can_see_bu_detail")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile || !profile.active) redirect("/login?erro=" + encodeURIComponent("Usuário inativo ou sem perfil. Fale com a Diretoria Corporativa."));
  if (roles.length && !roles.includes(profile.role)) redirect("/");
  return { supabase, user, profile };
}

export function homeFor(role: Role) {
  return role === "admin" ? "/admin" : role === "head" ? "/bu" : DIRECTORS_ENABLED ? "/diretor" : "/em-breve";
}
