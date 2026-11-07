export type Role = "admin" | "head" | "diretor";
export type SubmissionStatus = "draft" | "submitted" | "reopened";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  regional: string | null;
  active: boolean;
  can_see_bu_detail: boolean;
}
export interface Bu { id: string; code: string; name: string; active: boolean; sort: number }
export interface Segment { id: string; name: string; wave: string; leader: string | null; active: boolean; sort: number }
export interface Criterion {
  id: number; name: string; question: string; weight: number; rubric: Record<string, string>;
}
export interface Offer {
  id: string; bu_id: string; code: string | null; name: string; description: string | null;
  offer_type: string | null; revenue_model: string | null; ticket_medio: number | null;
  bcg: string | null; active: boolean;
  /** agrupamento: oferta que reúne outras (classificada no lugar delas) */
  is_group: boolean;
  /** quando a oferta faz parte de um agrupamento, o id dele */
  group_id: string | null;
}

/** Andamento das etapas de uma BU: 1) conferir ofertas → 2) agrupar → 3) classificar. */
export interface BuStage { offersConfirmedAt: string | null; groupingConfirmedAt: string | null }
export interface EvaluationScored {
  id: string; offer_id: string; segment_id: string; bu_id: string; not_applicable: boolean;
  n1: number | null; n2: number | null; n3: number | null; n4: number | null; n5: number | null;
  e1: string | null; e2: string | null; e3: string | null; e4: string | null; e5: string | null;
  updated_at: string; score: number | null; class_code: string | null; specialist_led: boolean;
}
export interface Pitch {
  id?: string; offer_id: string; bu_id: string; segment_id: string;
  /** descrição da oferta (vem pré-preenchida com a da oferta) */
  descricao: string | null; dores: string | null; proposta_valor: string | null; pitch_abertura: string | null;
  pergunta_1: string | null; pergunta_2: string | null; pergunta_3: string | null;
  /** cases de sucesso: um ou mais */
  cases: { cliente: string; desafio: string; solucao: string; resultado: string }[];
  /** perfil ideal de cliente, em campos específicos */
  perfil_cliente: string | null; persona_decisora: string | null; persona_influenciadora: string | null;
  funcionarios_min: number | null; funcionarios_max: number | null;
  modelo_receita: "Recorrente" | "Pontual" | null;
  /** recorrente: valor mensal · pontual: volume do deal */
  ticket_medio: number | null;
  updated_at?: string;
}
export interface Submission { bu_id: string; status: SubmissionStatus; submitted_at: string | null; reopened_at: string | null; updated_at: string }

export type MmtType = "manter" | "mudar" | "treinar";
export type MmtPriority = "alta" | "media" | "baixa";
export interface MmtRecord {
  id: string; author_id: string; type: MmtType; segment_id: string; bu_id: string; offer_id: string | null;
  regional: string | null; priority: MmtPriority | null;
  headline: string | null; evidence: string | null; reason: string | null; action: string | null; indicator: string | null;
  audience: "AM" | "Especialista" | "Arquiteto" | "Outro" | null; audience_other: string | null;
  created_at: string; updated_at: string;
}
export interface MmtSubmission { user_id: string; status: SubmissionStatus; submitted_at: string | null; reopened_at: string | null; updated_at: string }

/** Registro de Manter/Mudar/Treinar com nomes resolvidos (telas consolidadas e exportação). */
export interface MmtRow extends MmtRecord { segmentName: string; buCode: string; offerName: string | null; authorName: string }
/** Pitch com nomes resolvidos. */
export interface PitchRow extends Pitch { segmentName: string; buCode: string; offerName: string; offerCode: string | null }
