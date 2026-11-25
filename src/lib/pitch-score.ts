import type { PitchData } from "@/lib/book";

/**
 * Nota do pitch como material de venda: seis critérios, cada um em um nível de 0 a 3.
 * A régua fica aqui (e aparece na tela); o total e a faixa são sempre calculados a partir dos níveis.
 */
export const CRITERIA = [
  { key: "dor", label: "Dor e alvo", max: 20, levels: ["Não preenchido", "Dores genéricas", "Dores da oferta, pouco do segmento ou sem consequência", "Dores do segmento e da oferta, com consequência, e perfil claro"] },
  { key: "proposta", label: "Proposta de valor", max: 20, levels: ["Não preenchida", "Descreve o serviço ou é genérica", "Promessa clara, sem diferencial", "Benefício concreto para o cliente e diferencial"] },
  { key: "prova", label: "Prova", max: 20, levels: ["Nenhuma", "Só nome de cliente ou só dado externo", "Case nosso com resultado, sem número", "Case nosso com resultado em número"] },
  { key: "abertura", label: "Abertura", max: 15, levels: ["Não é uma fala ao cliente", "Muito longa (mais de 150 palavras) ou só descritiva", "Boa, mas longa ou sem pedido claro", "Até cerca de 30 segundos, dor primeiro e um pedido"] },
  { key: "perguntas", label: "Perguntas de descoberta", max: 15, levels: ["Não preenchidas", "Fechadas ou genéricas", "Boas, algumas fechadas ou com jargão", "Abertas, ligadas à dor, qualificam o cliente"] },
  { key: "clareza", label: "Clareza para o vendedor", max: 10, levels: ["Não dá para entender", "Longo, com jargão, erros ou anotações", "Pequenos excessos", "Curto, direto, pronto para usar"] },
] as const;

export type CriterionKey = (typeof CRITERIA)[number]["key"];
export type Level03 = 0 | 1 | 2 | 3;
const POINTS: Record<number, readonly number[]> = { 20: [0, 7, 13, 20], 15: [0, 5, 10, 15], 10: [0, 3, 7, 10] };

export const ALERT_LABEL = { numero: "Número a conferir", interno: "Informação interna" } as const;
export type AlertType = keyof typeof ALERT_LABEL;

export interface PitchScore {
  levels: Record<CriterionKey, Level03>;
  reasons: Partial<Record<CriterionKey, string>>;
  alerts: { tipo: AlertType; texto: string }[];
  improvements: string[];
  evaluator: string; evaluatedAt: string;
  /** o pitch mudou depois da avaliação */
  stale: boolean;
}

export const pointsOf = (key: CriterionKey, level: Level03): number => POINTS[CRITERIA.find((c) => c.key === key)!.max][level];
export const scoreTotal = (levels: Record<CriterionKey, Level03>): number => CRITERIA.reduce((sum, c) => sum + pointsOf(c.key, levels[c.key]), 0);

export type Band = "pronto" | "ajustar" | "refazer";
export const BAND_LABEL: Record<Band, string> = { pronto: "Pronto para o vendedor", ajustar: "Ajustar antes de usar", refazer: "Refazer" };
export const BAND_STYLE: Record<Band, string> = { pronto: "bg-(--brand) text-white", ajustar: "bg-(--accent-100) text-(--accent-800)", refazer: "bg-red-100 text-red-800" };

/** 80 ou mais está pronto, desde que sem alerta; 60 a 79 pede ajuste; abaixo de 60 é refazer. */
export function scoreBand(total: number, alerts: readonly unknown[]): Band {
  if (total < 60) return "refazer";
  return total < 80 || alerts.length > 0 ? "ajustar" : "pronto";
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Valida o que veio do banco ou do arquivo de carga. Sem os seis níveis (0 a 3), não há nota. */
export function parseScore(raw: { levels?: unknown; reasons?: unknown; alerts?: unknown; improvements?: unknown }): Omit<PitchScore, "evaluator" | "evaluatedAt" | "stale"> | null {
  const l = obj(raw.levels), r = obj(raw.reasons);
  const levels = {} as Record<CriterionKey, Level03>;
  const reasons: Partial<Record<CriterionKey, string>> = {};
  for (const c of CRITERIA) {
    const n = l[c.key];
    if (n !== 0 && n !== 1 && n !== 2 && n !== 3) return null;
    levels[c.key] = n;
    const why = text(r[c.key], 300);
    if (why) reasons[c.key] = why;
  }
  const alerts = (Array.isArray(raw.alerts) ? raw.alerts : []).map(obj)
    .filter((a) => (a.tipo === "numero" || a.tipo === "interno") && text(a.texto, 400))
    .map((a) => ({ tipo: a.tipo as AlertType, texto: text(a.texto, 400) }));
  const improvements = (Array.isArray(raw.improvements) ? raw.improvements : []).map((x) => text(x, 300)).filter(Boolean).slice(0, 5);
  return { levels, reasons, alerts, improvements };
}

const norm = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** Texto do pitch que foi avaliado, normalizado: espaços e quebras de linha não contam como mudança. */
export function pitchFingerprint(p: Partial<PitchData> | null | undefined): string {
  const fields = [p?.descricao, p?.dores, p?.proposta_valor, p?.pitch_abertura, p?.pergunta_1, p?.pergunta_2, p?.pergunta_3, p?.perfil_cliente, p?.persona_decisora, p?.persona_influenciadora].map(norm);
  const cases = (p?.cases ?? []).map((c) => [c?.cliente, c?.desafio, c?.solucao, c?.resultado].map(norm)).filter((c) => c.some(Boolean));
  return JSON.stringify([fields, cases]);
}
