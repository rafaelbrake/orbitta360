import { AppShell, type NavGroup } from "@/components/AppShell";
import { DIRECTORS_ENABLED } from "@/lib/features";
import { loadSegmentLeaders } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { signOut } from "@/app/actions/auth";

const ROLE_LABEL = { admin: "Diretoria Corporativa", head: "Head de BU", diretor: "Diretor Comercial" } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireProfile();

  // Segmentos que o usuário lidera (qualquer perfil): ganham o item "Meu segmento" no menu
  let ledItems: { href: string; label: string; icon: "target" }[] = [];
  if (DIRECTORS_ENABLED) {
    const [leaders, segs] = await Promise.all([loadSegmentLeaders(supabase), supabase.from("segments").select("id,name,sort").eq("active", true).order("sort")]);
    ledItems = (segs.data ?? [])
      .filter((s) => (leaders.get(s.id as string) ?? []).includes(profile.id))
      .map((s) => ({ href: `/segmento/${s.id}`, label: `Meu segmento · ${s.name}`, icon: "target" as const }));
  }

  const groups: NavGroup[] =
    profile.role === "admin"
      ? [
          {
            title: "Acompanhamento",
            items: [
              { href: "/admin", label: "Progresso", icon: "dashboard", exact: true },
              { href: "/consolidado/ranking", label: "Consolidado", icon: "bar_chart", match: "/consolidado" },
              { href: "/bu", label: "Pontuação por BU", icon: "list_alt" },
              ...(DIRECTORS_ENABLED ? [{ href: "/admin/diretores", label: "Diretores regionais", icon: "group" as const, match: "/admin/diretores" }, { href: "/segmento", label: "Consolidação por segmento", icon: "target" as const, match: "/segmento" }] : []),
            ],
          },
          {
            title: "Cadastros",
            items: [
              { href: "/admin/usuarios", label: "Usuários", icon: "group" },
              { href: "/admin/bus", label: "BUs", icon: "inventory_2" },
              { href: "/admin/segmentos", label: "Segmentos", icon: "target" },
            ],
          },
          {
            title: "Administração",
            items: [
              { href: "/admin/config", label: "Configuração", icon: "tune" },
              { href: "/admin/auditoria", label: "Auditoria", icon: "history" },
            ],
          },
        ]
      : profile.role === "head"
        ? [{ items: [{ href: "/bu", label: "Minhas BUs", icon: "inventory_2" }, ...ledItems] }]
        : !DIRECTORS_ENABLED
          ? [] // área dos diretores oculta por enquanto (ver src/lib/features.ts)
          : [
            {
              items: [
                { href: "/diretor/regiao", label: "Minha região", icon: "target", exact: true },
                { href: "/diretor", label: "Destaques por oferta", icon: "assignment", exact: true },
                ...ledItems,
                ...(profile.can_see_bu_detail
                  ? ([
                      { href: "/consolidado/ranking", label: "Ranking", icon: "bar_chart" },
                      { href: "/consolidado/heatmap", label: "Heatmap", icon: "grid_view" },
                    ] as const)
                  : []),
              ],
            },
          ];

  return (
    <AppShell groups={groups} user={{ name: profile.full_name || profile.email, role: ROLE_LABEL[profile.role] }} signOut={signOut}>
      {children}
    </AppShell>
  );
}
