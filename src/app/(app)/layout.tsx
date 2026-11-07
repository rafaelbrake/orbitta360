import { AppShell, type NavGroup } from "@/components/AppShell";
import { DIRECTORS_ENABLED } from "@/lib/features";
import { requireProfile } from "@/lib/session";
import { signOut } from "@/app/actions/auth";

const ROLE_LABEL = { admin: "Diretoria Corporativa", head: "Head de BU", diretor: "Diretor Comercial" } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();

  const groups: NavGroup[] =
    profile.role === "admin"
      ? [
          {
            title: "Acompanhamento",
            items: [
              { href: "/admin", label: "Progresso", icon: "dashboard", exact: true },
              { href: "/consolidado/ranking", label: "Consolidado", icon: "bar_chart", match: "/consolidado" },
              { href: "/bu", label: "Pontuação por BU", icon: "list_alt" },
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
        ? [{ items: [{ href: "/bu", label: "Minhas BUs", icon: "inventory_2" }] }]
        : !DIRECTORS_ENABLED
          ? [] // área dos diretores oculta por enquanto (ver src/lib/features.ts)
          : [
            {
              items: [
                { href: "/diretor", label: "Manter / Mudar / Treinar", icon: "assignment" },
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
