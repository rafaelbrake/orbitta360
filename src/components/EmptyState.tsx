import { Icon, type IconName } from "@/components/Icon";

/** Estado vazio com orientação do próximo passo (ícone, título, explicação e ação opcional). */
export function EmptyState({ icon = "inbox", title, children, compact = false }: { icon?: IconName; title: string; children?: React.ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "py-6" : "py-12"}`}>
      <span className="mb-3 grid size-12 place-items-center rounded-full bg-(--brand-100) text-(--brand-800)">
        <Icon name={icon} size={26} />
      </span>
      <p className="font-semibold text-(--forest)">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-(--ink-2)">{children}</div>}
    </div>
  );
}
