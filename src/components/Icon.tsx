import { ICON_PATHS, type IconName } from "@/components/icons.generated";

/**
 * Ícones Material Symbols (outline, peso regular), como pede o brand book.
 * Decorativo por padrão (aria-hidden); passe `label` quando o ícone for a única informação.
 */
export function Icon({ name, size = 20, label, className = "" }: { name: IconName; size?: number; label?: string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 -960 960 960"
      fill="currentColor"
      className={`shrink-0 ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
export type { IconName };
