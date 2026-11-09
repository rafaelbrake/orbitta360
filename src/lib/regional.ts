import type { RegionalView } from "@/lib/types";

/** A visão de um segmento conta como preenchida quando há texto (espaços não contam). */
export const isViewFilled = (v: Pick<RegionalView, "works" | "not_works"> | null | undefined) =>
  !!v && ((v.works ?? "").trim() !== "" || (v.not_works ?? "").trim() !== "");

export const VIEW_MAX = 4000;

/** Texto vindo do formulário → texto limpo (ou null) com limite de tamanho. */
export const cleanViewText = (v: unknown): string | null => (typeof v === "string" ? v.trim().slice(0, VIEW_MAX) || null : null);

/** Regionais sugeridas ao cadastrar um diretor (o campo continua livre). */
export const REGIONAL_SUGGESTIONS = ["Sul", "SP", "Demais estados", "Nacional"] as const;
