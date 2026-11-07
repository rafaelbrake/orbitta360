import type { MmtPriority, MmtRecord, MmtType } from "@/lib/types";

export const MMT_TYPES: MmtType[] = ["manter", "mudar", "treinar"];
export const MMT_LABEL: Record<MmtType, string> = { manter: "Manter", mudar: "Mudar", treinar: "Treinar" };
export const PRIORITIES: MmtPriority[] = ["alta", "media", "baixa"];
export const PRIORITY_LABEL: Record<MmtPriority, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
export const PRIORITY_ORDER: Record<MmtPriority, number> = { alta: 0, media: 1, baixa: 2 };
export const AUDIENCES = ["AM", "Especialista", "Arquiteto", "Outro"] as const;

/** As 4 etapas da atividade, exibidas na tela do Diretor Comercial. */
export const MMT_STEPS = [
  { title: "Analisar os dados de 2026", text: "Oportunidades vencidas, perdidas e churn da sua regional." },
  { title: "Debater causas e aprendizados", text: "Por que ganhamos, por que perdemos, o que se repetiu." },
  { title: "Definir ações de Manter, Mudar e Treinar", text: "Um registro por prática, problema ou competência." },
  { title: "Priorizar e virar iniciativa do GTM 2027", text: "Marque a prioridade de cada registro e envie." },
];

interface FieldSpec { label: string; hint: string; placeholder: string }
export interface TypeSpec {
  intro: string;
  headline: FieldSpec;
  evidence: FieldSpec;
  reason?: FieldSpec;
  action: FieldSpec;
  indicator: FieldSpec;
  audience?: boolean;
}

export const MMT_SPEC: Record<MmtType, TypeSpec> = {
  manter: {
    intro: "Uma prática que funcionou em 2026 e deve continuar.",
    headline: { label: "Prática vencedora", hint: "O que fizemos que deu resultado.", placeholder: "Ex.: diagnóstico de riscos antes da apresentação comercial" },
    evidence: { label: "Evidência", hint: "Dados de vendas ganhas, conversão, casos.", placeholder: "Ex.: 12 das 15 oportunidades ganhas tiveram diagnóstico prévio" },
    reason: { label: "Por que funcionou?", hint: "A causa do resultado.", placeholder: "Ex.: o cliente enxergou o risco antes de ver preço" },
    action: { label: "Manter em 2027", hint: "Como garantir que continue.", placeholder: "Ex.: tornar o diagnóstico etapa padrão do processo comercial" },
    indicator: { label: "Indicador", hint: "Como vamos medir.", placeholder: "Ex.: conversão de oportunidades com diagnóstico" },
  },
  mudar: {
    intro: "Um problema visto nas oportunidades perdidas ou no churn de 2026.",
    headline: { label: "Problema", hint: "O que não está funcionando.", placeholder: "Ex.: dificuldade em demonstrar retorno financeiro" },
    evidence: { label: "Evidência", hint: "Dados de vendas perdidas, churn, feedback.", placeholder: "Ex.: 8 perdas por \"sem business case\" no ano" },
    reason: { label: "Causa-raiz", hint: "Por que acontece (não o sintoma).", placeholder: "Ex.: proposta sem quantificação de ganho" },
    action: { label: "Mudar em 2027", hint: "A mudança concreta.", placeholder: "Ex.: apresentar business case financeiro nas propostas qualificadas" },
    indicator: { label: "Indicador", hint: "Como vamos medir.", placeholder: "Ex.: % de propostas com business case" },
  },
  treinar: {
    intro: "Uma competência que o time precisa desenvolver.",
    headline: { label: "Competência ou conhecimento a desenvolver", hint: "O que falta saber ou saber fazer.", placeholder: "Ex.: conduzir conversa de valor com CIO e CISO" },
    evidence: { label: "Evidência do gap", hint: "Onde o gap apareceu em 2026.", placeholder: "Ex.: reuniões sem avanço de etapa em contas de saúde" },
    action: { label: "Como desenvolver", hint: "Formato e prazo.", placeholder: "Ex.: trilha de 3 encontros com especialistas e cases" },
    indicator: { label: "Indicador", hint: "Como vamos medir.", placeholder: "Ex.: avanço de etapa após a 1ª reunião" },
    audience: true,
  },
};

/** Rótulos do tipo para exibição/exportação (ex.: "Prática vencedora" em registros Manter). */
export const labelsOf = (type: MmtType) => ({
  headline: MMT_SPEC[type].headline.label,
  evidence: MMT_SPEC[type].evidence.label,
  reason: MMT_SPEC[type].reason?.label ?? null,
  action: MMT_SPEC[type].action.label,
  indicator: MMT_SPEC[type].indicator.label,
});

const blank = (v: string | null | undefined) => !v || v.trim() === "";

/** Campos que faltam (espelha public.mmt_gaps no banco). Vazio = pronto para enviar. */
export function missingFields(r: Pick<MmtRecord, "type" | "priority" | "headline" | "evidence" | "reason" | "action" | "indicator" | "audience" | "audience_other">): string[] {
  const s = MMT_SPEC[r.type];
  const out: string[] = [];
  if (!r.priority) out.push("prioridade");
  if (blank(r.headline)) out.push(s.headline.label.toLowerCase());
  if (blank(r.evidence)) out.push("evidência");
  if (s.reason && blank(r.reason)) out.push(s.reason.label.toLowerCase());
  if (blank(r.action)) out.push(s.action.label.toLowerCase());
  if (blank(r.indicator)) out.push("indicador");
  if (s.audience) {
    if (!r.audience) out.push("público");
    else if (r.audience === "Outro" && blank(r.audience_other)) out.push("qual público");
  }
  return out;
}
export const isMmtComplete = (r: Parameters<typeof missingFields>[0]) => missingFields(r).length === 0;

export function sortMmt<T extends Pick<MmtRecord, "priority" | "updated_at">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const pa = a.priority ? PRIORITY_ORDER[a.priority] : 3;
    const pb = b.priority ? PRIORITY_ORDER[b.priority] : 3;
    return pa - pb || b.updated_at.localeCompare(a.updated_at);
  });
}

export function mmtStatusOf(sub: { status: string } | null | undefined, count: number): "none" | "progress" | "submitted" | "reopened" {
  if (sub?.status === "submitted") return "submitted";
  if (sub?.status === "reopened") return "reopened";
  return count > 0 ? "progress" : "none";
}
