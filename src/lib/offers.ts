import { fmtBRL, parseBRL } from "@/lib/format";
import { norm } from "@/lib/list";
import type { Offer } from "@/lib/types";

/** Listas padronizadas do cadastro de ofertas (o banco recusa qualquer outro valor). */
export const OFFER_TYPES = ["Software", "Hardware", "Serviço"] as const;
export const REVENUE_MODELS = ["Recorrente", "Pontual"] as const;
export type OfferType = (typeof OFFER_TYPES)[number];
export type RevenueModel = (typeof REVENUE_MODELS)[number];

export interface Normalized<T> { value: T | null; /** o texto original foi interpretado, não era um valor da lista */ adjusted: boolean }

const exact = <T extends string>(list: readonly T[], raw: string): T | undefined => list.find((v) => norm(v) === norm(raw));

/** Enquadra um texto livre na lista de tipos. Mesma regra aplicada pela migration aos dados antigos. */
export function normalizeOfferType(raw: string | null | undefined): Normalized<OfferType> {
  const s = (raw ?? "").trim();
  if (!s) return { value: null, adjusted: false };
  const hit = exact(OFFER_TYPES, s);
  if (hit) return { value: hit, adjusted: false };
  const n = norm(s);
  if (/hardware|equipamento|dispositivo|device/.test(n)) return { value: "Hardware", adjusted: true };
  if (/software|licen|saas/.test(n)) return { value: "Software", adjusted: true };
  return { value: "Serviço", adjusted: true };
}

export function normalizeRevenueModel(raw: string | null | undefined): Normalized<RevenueModel> {
  const s = (raw ?? "").trim();
  if (!s) return { value: null, adjusted: false };
  const hit = exact(REVENUE_MODELS, s);
  if (hit) return { value: hit, adjusted: false };
  return { value: /recorr|assinatura|mensal|contrato/.test(norm(s)) ? "Recorrente" : "Pontual", adjusted: true };
}

/**
 * O campo "ticket médio" é um só, mas o que se informa nele depende do modelo de receita:
 *  - Recorrente → valor MENSAL do contrato (R$/mês);
 *  - Pontual    → VOLUME DO DEAL, o valor de uma venda/projeto (R$).
 * Em cálculos, use sempre `annualizedTicket`: ele devolve o valor numa base comparável (ano).
 */
export const MONTHS_PER_YEAR = 12;

export function ticketLabel(model: string | null | undefined): string {
  return model === "Recorrente" ? "Ticket médio mensal (R$/mês)" : model === "Pontual" ? "Volume do deal (R$)" : "Ticket médio (R$)";
}

export function ticketHint(model: string | null | undefined): string {
  return model === "Recorrente"
    ? "Valor médio por mês de um contrato recorrente. O sistema anualiza (× 12) quando compara com o ticket da BU."
    : model === "Pontual"
      ? "Valor médio de um deal pontual (projeto ou venda única). Entra nos cálculos como está."
      : "Escolha o modelo de receita: recorrente informa o valor mensal; pontual, o volume do deal.";
}

/** Sufixo de exibição: "/mês" para recorrente, "/deal" para pontual. */
export const ticketUnit = (model: string | null | undefined) => (model === "Recorrente" ? "/mês" : model === "Pontual" ? "/deal" : "");

export function fmtTicket(value: number | null | undefined, model: string | null | undefined): string {
  return value == null ? "—" : `${fmtBRL(value)}${ticketUnit(model)}`;
}

/** Valor na base anual: recorrente × 12; pontual (volume do deal) como está; sem modelo, como está. */
export function annualizedTicket(value: number | null | undefined, model: string | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return model === "Recorrente" ? value * MONTHS_PER_YEAR : value;
}

/**
 * Próximo ID de uma BU: OF-NN para ofertas e AG-NN para agrupamentos (sequência separada), a partir do maior número
 * já usado. Espelha o gatilho do banco; aqui serve para mostrar o ID antes de salvar (o banco é quem o grava).
 */
export function nextOfferCode(existing: (string | null | undefined)[], isGroup = false): string {
  const prefix = isGroup ? "AG" : "OF";
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const max = existing.reduce<number>((m, c) => {
    const n = re.exec((c ?? "").trim())?.[1];
    return n ? Math.max(m, Number(n)) : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(2, "0")}`;
}

/** Oferta que entra na classificação: ativa e fora de qualquer agrupamento (o próprio agrupamento conta). */
export const isScorable = (o: Pick<Offer, "active" | "group_id">) => o.active && !o.group_id;

/**
 * Sugere o nome de um agrupamento pelo começo em comum dos nomes:
 * "Alocação - Dev C#" + "Alocação - Dev Java" → "Alocação". Vazio se não houver base comum.
 */
export function suggestGroupName(names: string[]): string {
  const list = names.map((n) => n.trim()).filter(Boolean);
  if (list.length < 2) return list[0] ?? "";
  let prefix = list[0];
  for (const n of list.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < n.length && prefix[i].toLowerCase() === n[i].toLowerCase()) i++;
    prefix = prefix.slice(0, i);
  }
  // corta na última fronteira de palavra para não deixar "Dev C" ou "Aloca"
  const full = list.every((n) => n.toLowerCase().startsWith(prefix.toLowerCase()) && (n.length === prefix.length || /[\s\-–—:/|]/.test(n[prefix.length] ?? "")));
  if (!full) prefix = prefix.replace(/[^\s\-–—:/|]*$/, "");
  return prefix.replace(/[\s\-–—:/|]+$/, "").trim();
}

/**
 * Valores iniciais do agrupamento a partir dos membros: tipo e modelo se forem iguais.
 * O ticket é a média dos membros, mas só quando todos têm o mesmo modelo: misturar valor mensal
 * com volume de deal não faz sentido, e então o campo vem vazio para o head preencher.
 */
export function groupDefaults(members: Pick<Offer, "offer_type" | "revenue_model" | "ticket_medio">[]) {
  const same = <K extends "offer_type" | "revenue_model">(k: K) => {
    const vals = new Set(members.map((m) => m[k] ?? ""));
    return vals.size === 1 && [...vals][0] ? ([...vals][0] as string) : null;
  };
  const revenue_model = same("revenue_model");
  const tickets = members.map((m) => m.ticket_medio).filter((t): t is number => typeof t === "number");
  return {
    offer_type: same("offer_type"),
    revenue_model,
    ticket_medio: revenue_model && tickets.length ? Math.round(tickets.reduce((a, b) => a + b, 0) / tickets.length) : null,
  };
}

/** Cadastro completo para fechar a etapa 1: tipo e modelo de receita (o ticket é opcional). */
export const isOfferComplete = (o: Pick<Offer, "offer_type" | "revenue_model">) => !!o.offer_type && !!o.revenue_model;

export function missingOfferFields(o: Pick<Offer, "offer_type" | "revenue_model">): string[] {
  return [!o.offer_type && "tipo", !o.revenue_model && "modelo de receita"].filter((x): x is string => !!x);
}

export interface OfferPatchInput { offer_type?: unknown; revenue_model?: unknown; ticket_medio?: unknown }
export type OfferPatch = { offer_type?: OfferType | null; revenue_model?: RevenueModel | null; ticket_medio?: number | null };

/**
 * Edição por linha da tabela: só os campos enviados mudam; vazio limpa o campo;
 * tipo e modelo precisam ser exatamente um valor da lista; ticket é número não negativo (aceita "8.000,50").
 */
export function sanitizeOfferPatch(input: OfferPatchInput): { ok: true; patch: OfferPatch } | { ok: false; error: string } {
  const patch: OfferPatch = {};
  const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
  if ("offer_type" in input) {
    if (blank(input.offer_type)) patch.offer_type = null;
    else if (OFFER_TYPES.includes(input.offer_type as OfferType)) patch.offer_type = input.offer_type as OfferType;
    else return { ok: false, error: "Tipo inválido: escolha Software, Hardware ou Serviço." };
  }
  if ("revenue_model" in input) {
    if (blank(input.revenue_model)) patch.revenue_model = null;
    else if (REVENUE_MODELS.includes(input.revenue_model as RevenueModel)) patch.revenue_model = input.revenue_model as RevenueModel;
    else return { ok: false, error: "Modelo inválido: escolha Recorrente ou Pontual." };
  }
  if ("ticket_medio" in input) {
    if (blank(input.ticket_medio)) patch.ticket_medio = null;
    else {
      const n = parseBRL(typeof input.ticket_medio === "number" ? input.ticket_medio : String(input.ticket_medio));
      if (n == null || n < 0) return { ok: false, error: "Informe um valor válido para o ticket." };
      patch.ticket_medio = n;
    }
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "Nada para alterar." };
  return { ok: true, patch };
}

export interface ActiveChangeRow { id: string; active: boolean; is_group: boolean; group_id: string | null; offer_type: string | null; revenue_model: string | null }
export interface ActiveChangePlan { ids: string[]; skipped: { id: string; reason: "grupo" | "membro" | "incompleta" }[] }

/**
 * Decide quais ofertas realmente mudam ao desconsiderar (active=false) ou reconsiderar (active=true):
 *  - agrupamentos e ofertas que já fazem parte de um agrupamento ficam de fora (desfaça o agrupamento antes);
 *  - com a etapa 1 já confirmada, só volta oferta que já tenha tipo e modelo (a lista confirmada não pode ficar incompleta).
 * Ofertas que já estão no estado pedido não entram na contagem.
 */
export function planActiveChange(rows: ActiveChangeRow[], active: boolean, offersConfirmed: boolean): ActiveChangePlan {
  const plan: ActiveChangePlan = { ids: [], skipped: [] };
  for (const r of rows) {
    if (r.is_group) plan.skipped.push({ id: r.id, reason: "grupo" });
    else if (r.group_id) plan.skipped.push({ id: r.id, reason: "membro" });
    else if (r.active === active) continue;
    else if (active && offersConfirmed && !isOfferComplete(r)) plan.skipped.push({ id: r.id, reason: "incompleta" });
    else plan.ids.push(r.id);
  }
  return plan;
}
