/**
 * Lista de Heads de BU para cadastro em lote: leitura de CSV/planilha e validação.
 * Colunas (cabeçalho na primeira linha): Nome · E-mail · BU (uma ou mais, ex.: "ITD + ITS").
 */
export interface HeadInput { line: number; name: string; email: string; buRaw: string }
export interface HeadRow { line: number; name: string; email: string; buCodes: string[]; issues: string[] }
export interface BuRef { code: string; name: string }

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** CSV com ";" (padrão do Excel no Brasil) ou ",", aspas e BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const first = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) && first.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

/** Tabela (primeira linha = cabeçalho) → linhas de entrada. Acha as colunas pelo nome. */
export function rowsFromTable(table: string[][]): { rows: HeadInput[] } | { error: string } {
  if (table.length < 2) return { error: "A lista está vazia: use a linha 1 como cabeçalho (Nome, E-mail, BU) e os heads a partir da linha 2." };
  const head = table[0].map(norm);
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const iName = col("nome"), iMail = col("e-mail", "email"), iBu = col("bu");
  if (iMail < 0 || iBu < 0) return { error: 'Cabeçalho esperado na linha 1: "Nome", "E-mail" e "BU".' };
  return {
    rows: table.slice(1).map((r, i) => ({ line: i + 2, name: (r[iName] ?? "").trim(), email: (r[iMail] ?? "").trim(), buRaw: (r[iBu] ?? "").trim() }))
      .filter((r) => r.name || r.email || r.buRaw),
  };
}

/** "ITD + ITS", "itd, its", "ITD e ITS", "IT Devices", "Print" → códigos das BUs; o que não casa vai em `unknown`. */
export function parseBuList(raw: string, bus: BuRef[]): { codes: string[]; unknown: string[] } {
  const byCode = new Map(bus.map((b) => [norm(b.code), b.code]));
  const byName = new Map(bus.map((b) => [norm(b.name), b.code]));
  const codes: string[] = [], unknown: string[] = [];
  for (const part of raw.split(/[+,;/&]|\se\s/i).map((p) => p.trim()).filter(Boolean)) {
    // sigla, nome completo ou o começo do nome (“Print” → Print Solutions), se só uma BU começar assim
    const starts = bus.filter((b) => norm(b.name).startsWith(norm(part) + " "));
    const c = byCode.get(norm(part)) ?? byName.get(norm(part)) ?? (starts.length === 1 ? starts[0].code : undefined);
    if (!c) unknown.push(part);
    else if (!codes.includes(c)) codes.push(c);
  }
  return { codes, unknown };
}

/** Valida e junta linhas do mesmo e-mail (um head com duas BUs em duas linhas vira um só). */
export function validateHeads(inputs: HeadInput[], bus: BuRef[]): HeadRow[] {
  const out: HeadRow[] = [];
  const byEmail = new Map<string, HeadRow>();
  for (const r of inputs) {
    const email = r.email.toLowerCase();
    const issues: string[] = [];
    if (!r.email) issues.push("e-mail em branco");
    else if (!EMAIL_RE.test(email)) issues.push(`e-mail inválido (“${r.email}”)`);
    if (!r.name) issues.push("nome em branco");
    const { codes, unknown } = parseBuList(r.buRaw, bus);
    if (!r.buRaw) issues.push("BU em branco");
    if (unknown.length) issues.push(`BU desconhecida: ${unknown.join(", ")}`);
    const prev = email && byEmail.get(email);
    if (prev) {
      for (const c of codes) if (!prev.buCodes.includes(c)) prev.buCodes.push(c);
      prev.issues.push(...issues.filter((i) => !prev.issues.includes(i)));
      continue;
    }
    const row: HeadRow = { line: r.line, name: r.name, email, buCodes: codes, issues };
    out.push(row);
    if (email) byEmail.set(email, row);
  }
  return out;
}
