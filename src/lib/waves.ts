import type { Segment } from "@/lib/types";

/**
 * Ondas de entrega dos heads. A onda de um segmento é o campo `wave` dele; o prazo de cada onda
 * fica em `settings` (chave `deadline_wave:<nome>`). O prazo geral dos heads é o da última onda.
 */
export interface Wave { name: string; deadline: string | null; segments: Segment[] }

export const waveDeadlineKey = (name: string) => `deadline_wave:${name}`;

/** "A", "A e B", "A, B e C" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
}

/** Nome curto para a tela: "Varejo (inclui Atacado)" → "Varejo". */
export const shortSegmentName = (name: string) => name.replace(/\s*\(.*\)\s*$/, "").trim() || name;

/**
 * Agrupa os segmentos ativos por onda, da entrega mais cedo para a mais tarde
 * (onda sem prazo vai por último; empate pelo nome). Dentro da onda vale a ordem do segmento.
 */
export function buildWaves(segments: Segment[], settings: Record<string, unknown>): Wave[] {
  const by = new Map<string, Segment[]>();
  for (const s of segments.filter((x) => x.active)) by.set(s.wave, [...(by.get(s.wave) ?? []), s]);
  const dl = (name: string) => {
    const v = settings[waveDeadlineKey(name)];
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  };
  return [...by.entries()]
    .map(([name, segs]) => ({ name, deadline: dl(name), segments: [...segs].sort((a, b) => a.sort - b.sort) }))
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.name.localeCompare(b.name, "pt-BR"));
}

/** Prazo geral dos heads: o da última onda (cai no prazo antigo quando nenhuma onda tem prazo). */
export function overallDeadline(waves: Wave[], fallback: string | null): string | null {
  const ds = waves.map((w) => w.deadline).filter((d): d is string => !!d).sort();
  return ds.at(-1) ?? fallback;
}

/** Segmentos ativos na ordem das ondas (para a matriz e as colunas). */
export const orderedSegments = (waves: Wave[]) => waves.flatMap((w) => w.segments);

/** Texto curto de quais segmentos entram na onda. */
export const waveScope = (w: Wave) => joinNames(w.segments.map((s) => shortSegmentName(s.name)));
