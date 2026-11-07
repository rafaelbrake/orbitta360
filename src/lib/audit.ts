import { fmtDateTime } from "@/lib/format";

/** Apresentação do log de auditoria: nomes legíveis, contexto da linha e diferenças campo a campo. */

export const TABLE_LABEL: Record<string, string> = {
  evaluations: "Avaliação (nota)",
  pitches: "Pitch",
  offers: "Oferta",
  bu_submissions: "Envio da BU",
  criteria: "Critério",
  class_bands: "Faixa de classificação",
  settings: "Configuração",
  profiles: "Perfil de usuário",
  mmt_records: "Manter / Mudar / Treinar",
  mmt_submissions: "Envio do diretor",
};

export const ACTION_LABEL: Record<string, string> = { INSERT: "Criou", UPDATE: "Alterou", DELETE: "Removeu" };

const FIELD_LABEL: Record<string, string> = {
  not_applicable: "Não se aplica", status: "Status", submitted_at: "Enviado em", reopened_at: "Reaberto em",
  name: "Nome", description: "Descrição", active: "Ativo", ticket_medio: "Ticket / volume do deal", offer_type: "Tipo", revenue_model: "Modelo de receita",
  weight: "Peso", question: "Pergunta", rubric: "Rubrica", min_score: "Score mínimo", max_score: "Score máximo", label: "Rótulo",
  value: "Valor", role: "Perfil", regional: "Regional", full_name: "Nome", can_see_bu_detail: "Vê detalhe das BUs",
  priority: "Prioridade", headline: "Campo principal", evidence: "Evidência", reason: "Motivo / causa-raiz", action: "Ação para 2027",
  indicator: "Indicador", audience: "Público", audience_other: "Qual público", segment_id: "Segmento", bu_id: "BU", offer_id: "Oferta",
  descricao: "Descrição da oferta", dores: "Dores", proposta_valor: "Proposta de valor", pitch_abertura: "Pitch de abertura",
  cases: "Cases de sucesso", perfil_cliente: "Perfil de cliente", persona_decisora: "Persona decisora", persona_influenciadora: "Persona influenciadora",
  funcionarios_min: "Funcionários (de)", funcionarios_max: "Funcionários (até)", modelo_receita: "Modelo de receita",
};

/** Campos que não agregam à leitura do log (carimbos automáticos e chaves). */
const IGNORED = new Set(["updated_at", "updated_by", "created_at", "id", "author_id", "submitted_by"]);

export interface AuditCtx {
  offers: Map<string, string>;
  segments: Map<string, string>;
  bus: Map<string, string>; // id → sigla
  people: Map<string, string>; // id → nome
  criteria: Map<number, string>;
}

type Row = Record<string, unknown>;

export function fieldLabel(key: string, ctx?: Pick<AuditCtx, "criteria">): string {
  const m = /^([ne])([1-5])$/.exec(key);
  if (m) {
    const name = ctx?.criteria.get(Number(m[2]));
    return `${m[1] === "n" ? "Nota" : "Evidência"} C${m[2]}${name ? ` (${name})` : ""}`;
  }
  return FIELD_LABEL[key] ?? key;
}

export function fmtValue(key: string, v: unknown, ctx: AuditCtx): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (key === "segment_id") return ctx.segments.get(String(v)) ?? String(v);
  if (key === "bu_id") return ctx.bus.get(String(v)) ?? String(v);
  if (key === "offer_id") return ctx.offers.get(String(v)) ?? String(v);
  if (key.endsWith("_at") && typeof v === "string") return fmtDateTime(v); // carimbos de data viram dd/mm/aaaa hh:mm
  if (typeof v === "object") return Array.isArray(v) ? v.map((x) => ctx.bus.get(String(x)) ?? String(x)).join(", ") : "(estrutura)";
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

/** A que a linha se refere (ex.: "SOC Gerenciado × Saúde"). */
export function describeRow(table: string, row: Row | null, ctx: AuditCtx): string {
  if (!row) return "";
  const s = (k: string) => (row[k] == null ? "" : String(row[k]));
  const seg = ctx.segments.get(s("segment_id")) ?? "";
  const bu = ctx.bus.get(s("bu_id")) ?? "";
  switch (table) {
    case "evaluations": return `${ctx.offers.get(s("offer_id")) ?? "oferta"} × ${seg}${bu ? ` (${bu})` : ""}`;
    case "pitches": return `${ctx.offers.get(s("offer_id")) ?? "oferta"} × ${seg}${bu ? ` (${bu})` : ""}`;
    case "offers": return `${s("name")}${bu ? ` (${bu})` : ""}`;
    case "bu_submissions": return ctx.bus.get(s("bu_id")) ?? "";
    case "criteria": return s("name");
    case "class_bands": return s("label");
    case "settings": return s("key");
    case "profiles": return s("full_name") || s("email");
    case "mmt_records": return [s("type"), seg, bu].filter(Boolean).join(" · ");
    case "mmt_submissions": return ctx.people.get(s("user_id")) ?? "";
    default: return "";
  }
}

export interface FieldChange { field: string; label: string; before: string; after: string }

/** Diferenças entre antes e depois (UPDATE). INSERT/DELETE não listam campo a campo. */
export function diffRow(oldRow: Row | null, newRow: Row | null, ctx: AuditCtx): FieldChange[] {
  if (!oldRow || !newRow) return [];
  return Object.keys(newRow)
    .filter((k) => !IGNORED.has(k) && JSON.stringify(newRow[k]) !== JSON.stringify(oldRow[k]))
    .map((k) => ({ field: k, label: fieldLabel(k, ctx), before: fmtValue(k, oldRow[k], ctx), after: fmtValue(k, newRow[k], ctx) }));
}

export const summarizeChanges = (changes: FieldChange[]) => changes.map((c) => `${c.label}: ${c.before} → ${c.after}`).join(" · ");
