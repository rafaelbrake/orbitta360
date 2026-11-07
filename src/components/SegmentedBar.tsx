export interface Segment { label: string; value: number; color: string }

/**
 * Barra segmentada fina (uma parte do todo por bloco, 2px de respiro entre eles).
 * A legenda com nomes e valores fica ao lado (o texto carrega os números; a barra só dá a visão geral).
 */
export function SegmentedBar({ parts, className = "" }: { parts: Segment[]; className?: string }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  return (
    <div className={className}>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-(--line)" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(", ")}>
        {total > 0 && parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.label} style={{ flex: p.value, background: p.color }} className="first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--ink-2)">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: p.color }} />
            {p.label} <strong className="tabular-nums text-(--ink)">{p.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
