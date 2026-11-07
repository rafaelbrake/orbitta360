import { DIRECTORS_ENABLED } from "@/lib/features";
import { Tabs } from "@/components/ui";
import type { Role } from "@/lib/types";

export function ConsolidadoNav({ current, role }: { current: "ranking" | "heatmap" | "comparativo" | "mmt"; role: Role }) {
  const items = [
    { key: "ranking", href: "/consolidado/ranking", label: "Ranking por segmento" },
    { key: "heatmap", href: "/consolidado/heatmap", label: "Heatmap BU × segmento" },
    { key: "comparativo", href: "/consolidado/comparativo", label: "Comparativo de critérios" },
    ...(role === "admin" && DIRECTORS_ENABLED ? [{ key: "mmt", href: "/consolidado/mmt", label: "Manter / Mudar / Treinar" }] : []),
  ];
  return <Tabs items={items} current={current} />;
}

export function ExportLink({ href, label = "Exportar para Excel" }: { href: string; label?: string }) {
  // Download: precisa de navegação completa (route handler), não de <Link>.
  return <a href={href} className="btn" download>{label}</a>;
}
