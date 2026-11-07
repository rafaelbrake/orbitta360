export const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T12:00:00") : new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(d);
};

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso)) : "—";

/** Dias corridos até uma data (aaaa-mm-dd), no fuso de Brasília. Negativo = prazo vencido. */
export function daysUntil(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now); // aaaa-mm-dd
  const ms = Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

/** Aceita número puro ou texto em formato brasileiro ("R$ 1.200.000,50"). */
export function parseBRL(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = raw.replace(/[^\d,.-]/g, "");
  if (!s) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
