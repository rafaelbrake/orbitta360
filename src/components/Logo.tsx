import Image from "next/image";

/**
 * Logotipo oficial Selbetti (brand book): sem recolorir, distorcer ou aplicar efeitos.
 * - "negativo": branco, para fundos escuros (Forest, Selbetti Green).
 * - "original": verde e laranja, para fundos claros.
 * A proporção é preservada pela altura; mantenha espaço livre ao redor.
 */
export function Logo({ variant, className = "h-7" }: { variant: "negativo" | "original"; className?: string }) {
  return (
    <Image
      src={`/brand/logo-selbetti-${variant}.png`}
      alt="Selbetti"
      width={960}
      height={254}
      priority
      className={`${className} w-auto`}
    />
  );
}
