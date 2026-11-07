import type { EmailOtpType } from "@supabase/supabase-js";

/** Tipos de link por e-mail aceitos (convite e redefinição de senha; o restante nunca é usado aqui). */
const TYPES: readonly EmailOtpType[] = ["invite", "recovery", "signup", "magiclink", "email"];

export const parseOtpType = (v: unknown): EmailOtpType | null => (typeof v === "string" && (TYPES as readonly string[]).includes(v) ? (v as EmailOtpType) : null);

/** Destino depois de confirmar: só caminho interno (nunca outro site). */
export const safeNext = (v: unknown, fallback = "/definir-senha") => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : fallback);
