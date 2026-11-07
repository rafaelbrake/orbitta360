import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";

const CLASS_STYLE: Record<string, string> = {
  alta: "bg-(--brand) text-white",
  potencial: "bg-(--brand-100) text-(--brand-800)",
  secundaria: "bg-(--accent-100) text-(--accent-800)",
  baixa: "bg-slate-200 text-slate-700",
};
export const classStyle = (code: string | null | undefined) => (code ? CLASS_STYLE[code] : "") ?? "";

export function ClassBadge({ code, label }: { code: string | null; label?: string }) {
  if (!code) return null;
  return <span className={`badge ${classStyle(code)}`}>{label ?? code}</span>;
}

/** Estado nunca só por cor: cada status tem ícone e texto. */
const STATUS: Record<string, { style: string; icon: IconName }> = {
  none: { style: "bg-slate-200 text-slate-700", icon: "schedule" },
  progress: { style: "bg-amber-100 text-amber-900", icon: "edit" },
  submitted: { style: "bg-(--brand-100) text-(--brand-800)", icon: "task_alt" },
  reopened: { style: "bg-(--forest) text-white", icon: "lock_open" },
};
export function StatusBadge({ status, label }: { status: string; label: string }) {
  const s = STATUS[status] ?? STATUS.none;
  return (
    <span className={`badge ${s.style}`}>
      <Icon name={s.icon} size={14} />
      {label}
    </span>
  );
}

export function ProgressBar({ done, total, unit = "células" }: { done: number; total: number; unit?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-(--line)" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% preenchido`}>
        <div className="h-full rounded-full bg-(--brand) transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-xs text-(--ink-3)">
        <span>{done} de {total} {unit}</span>
        <span className="font-semibold tabular-nums text-(--ink-2)">{pct}%</span>
      </div>
    </div>
  );
}

export function Tabs({ items, current }: { items: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-(--line)" aria-label="Seções">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={i.key === current ? "page" : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors ${
            i.key === current ? "border-(--accent) text-(--forest)" : "border-transparent text-(--ink-3) hover:border-(--line-strong) hover:text-(--forest)"
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/** Cabeçalho padrão de página: título, apoio e ações alinhadas à direita (quebra em telas pequenas). */
export function PageHeader({ title, subtitle, actions, children }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h1>{title}</h1>{children}</div>
        {subtitle && <p className="mt-1 text-sm text-(--ink-2)">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Aviso em bloco, com ícone (o estado nunca depende só da cor). */
const NOTICE: Record<string, { box: string; icon: IconName }> = {
  info: { box: "border-(--calm) bg-(--brand-50) text-(--forest)", icon: "info" },
  success: { box: "border-(--calm) bg-(--brand-50) text-(--brand-800)", icon: "check_circle" },
  warn: { box: "border-amber-300 bg-amber-50 text-amber-900", icon: "warning" },
  accent: { box: "border-(--accent) bg-(--accent-100) text-(--accent-800)", icon: "lock_open" },
  danger: { box: "border-red-300 bg-(--danger-100) text-red-900", icon: "error" },
};
export function Notice({ tone = "info", icon, children, className = "" }: { tone?: keyof typeof NOTICE; icon?: IconName; children: React.ReactNode; className?: string }) {
  const n = NOTICE[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${n.box} ${className}`}>
      <Icon name={icon ?? n.icon} size={20} className="mt-px" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Voltar para a listagem, no topo das telas de detalhe e de novo cadastro. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-(--brand) hover:underline">
      <Icon name="arrow_back" size={18} />{children}
    </Link>
  );
}

/** Rodapé padrão de formulários de cadastro: ação principal e cancelar. */
export function FormFooter({ children, cancelHref, cancelLabel = "Cancelar" }: { children: React.ReactNode; cancelHref: string; cancelLabel?: string }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-(--line) pt-4">
      {children}
      <Link href={cancelHref} className="btn">{cancelLabel}</Link>
    </div>
  );
}
