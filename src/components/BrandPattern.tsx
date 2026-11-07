/**
 * Padrão "pontos e quadrados" (círculo + quadrado em disposição aleatória) do brand book.
 * Aproximação em SVG gerada com semente fixa (resultado estável entre renderizações).
 * Para usar o arquivo oficial (Pattern.png / Elementos), troque este componente por uma <img>.
 */
const COLORS = ["#80baa5", "#00754a", "#ffffff", "#ef8943"];

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

export function BrandPattern({ className = "" }: { className?: string }) {
  const rand = rng(2027);
  const cell = 44;
  const cols = 28;
  const rows = 18;
  const items: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const skip = rand() < 0.62; // espaço vazio: dá respiro ao padrão
      const px = c / cols;
      const py = r / rows;
      // Área de proteção do logotipo: nenhum elemento do padrão perto do logo e do cartão de login.
      const inClearZone = px > 0.28 && px < 0.72 && py > 0.08 && py < 0.88;
      if (skip || inClearZone) continue;
      const size = 6 + Math.floor(rand() * 3) * 5;
      const color = COLORS[Math.floor(rand() * COLORS.length)];
      const x = c * cell + cell / 2;
      const y = r * cell + cell / 2;
      const opacity = color === "#ef8943" ? 0.9 : 0.35 + rand() * 0.4;
      items.push(
        rand() < 0.5 ? (
          <circle key={`${r}-${c}`} cx={x} cy={y} r={size / 2} fill={color} opacity={opacity} />
        ) : (
          <rect key={`${r}-${c}`} x={x - size / 2} y={y - size / 2} width={size} height={size} fill={color} opacity={opacity} />
        ),
      );
    }
  }
  return (
    <svg aria-hidden="true" className={className} viewBox={`0 0 ${cols * cell} ${rows * cell}`} preserveAspectRatio="xMidYMid slice">
      {items}
    </svg>
  );
}
