/** Utilidades das telas de listagem: busca sem acento, paginação e querystring. */

/** Minúsculas e sem acentos, para buscar "Saude" e achar "Saúde". */
export const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Todas as palavras da busca precisam aparecer em algum dos campos. */
export function matchesQuery(q: string | undefined, ...fields: (string | null | undefined)[]): boolean {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = norm(fields.filter(Boolean).join(" "));
  return terms.every((t) => hay.includes(t));
}

export const PAGE_SIZE = 20;

export function paginate<T>(items: T[], page: number, size = PAGE_SIZE) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), page: current, pages, total, from: total ? start + 1 : 0, to: Math.min(start + size, total) };
}

/** Texto simples da querystring (primeiro valor, sem espaços nas pontas). */
export function param(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : undefined;
}

export const pageParam = (v: string | string[] | undefined) => Math.max(1, Number.parseInt(param(v) ?? "1", 10) || 1);

/** Monta ?a=1&b=2 ignorando valores vazios. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** Valores distintos (sem vazio), em ordem alfabética, para alimentar filtros. */
export function distinct(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.map((v) => (v ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
