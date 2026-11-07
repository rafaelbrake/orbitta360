import { Icon, type IconName } from "@/components/Icon";

/** Indicador de topo de painel: valor em destaque, rótulo e contexto. Sem gráfico quando há um número só. */
export function StatTile({ label, value, hint, icon, tone = "brand" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon: IconName; tone?: "brand" | "accent" | "forest" }) {
  const tones = {
    brand: "bg-(--brand-100) text-(--brand-800)",
    accent: "bg-(--accent-100) text-(--accent-800)",
    forest: "bg-(--forest) text-white",
  } as const;
  return (
    <div className="card flex items-start gap-3">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon name={icon} size={22} /></span>
      <div className="min-w-0">
        <div className="eyebrow">{label}</div>
        <div className="mt-0.5 font-[family-name:var(--font-oswald)] text-3xl font-medium leading-none text-(--forest) tabular-nums">{value}</div>
        {hint && <div className="mt-1.5 text-xs text-(--ink-3)">{hint}</div>}
      </div>
    </div>
  );
}
