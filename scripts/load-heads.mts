/**
 * Cadastro em lote dos Heads de BU.
 *
 *   npm run load:heads -- --file "/caminho/heads.xlsx"             → SIMULA: mostra o que seria feito
 *   npm run load:heads -- --file "/caminho/heads.xlsx" --confirm   → cadastra e envia os convites por e-mail
 *
 * Planilha (Excel .xlsx ou CSV), cabeçalho na linha 1: Nome · E-mail · BU
 * (BU = sigla ou nome; mais de uma separada por "+", vírgula ou "e": "ITD + ITS").
 *
 * Opções:
 *   --sem-email   cadastra e vincula as BUs, mas NÃO envia e-mail (convide depois pelo --reenviar)
 *   --reenviar    para quem já existe e nunca entrou: envia o e-mail de definição de senha de novo
 *   --site URL    endereço do sistema nos links (padrão: https://www.orbitta360.com)
 *
 * Seguro para rodar de novo: quem já existe só ganha as BUs que faltam. Nunca altera admin/diretor.
 * Se qualquer linha da planilha tiver problema, NADA é gravado.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { adminClient } from "./_client.mjs";
import { parseCsv, rowsFromTable, validateHeads } from "../src/lib/import-heads";

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const file = opt("--file");
const confirm = args.includes("--confirm");
const semEmail = args.includes("--sem-email");
const reenviar = args.includes("--reenviar");
const site = (opt("--site") ?? "https://www.orbitta360.com").replace(/\/+$/, "");
if (!file) { console.error('Informe a lista: npm run load:heads -- --file "/caminho/heads.xlsx" [--confirm]'); process.exit(1); }

// ---------- lê a planilha ----------
const cellText = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("richText" in o) return (o.richText as { text: string }[]).map((t) => t.text).join("").trim();
    if ("text" in o) return String(o.text).trim();       // hiperlink (e-mails costumam vir assim)
    if ("result" in o) return cellText(o.result);
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
};
let table: string[][];
if (path.extname(file).toLowerCase() === ".csv") table = parseCsv(readFileSync(file, "utf8"));
else {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  if (!ws) { console.error("A planilha está vazia."); process.exit(1); }
  table = [];
  ws.eachRow({ includeEmpty: false }, (row) => { table.push(Array.from({ length: Math.max(row.cellCount, 3) }, (_, i) => cellText(row.getCell(i + 1).value))); });
}
const parsed = rowsFromTable(table);
if ("error" in parsed) { console.error(parsed.error); process.exit(1); }

// ---------- compara com o que já existe ----------
const { supabase } = adminClient();
const { data: bus, error: be } = await supabase.from("bus").select("id,code,name").eq("active", true);
if (be || !bus) { console.error("Não consegui ler as BUs:", be?.message); process.exit(1); }
const rows = validateHeads(parsed.rows, bus as { code: string; name: string }[]);

const authUsers: { id: string; email: string; last: string | null }[] = [];
for (let page = 1; ; page++) {
  const r = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (r.error) { console.error("Não consegui listar usuários:", r.error.message); process.exit(1); }
  authUsers.push(...r.data.users.map((u) => ({ id: u.id, email: (u.email ?? "").toLowerCase(), last: u.last_sign_in_at ?? null })));
  if (r.data.users.length < 200) break;
}
const { data: profiles } = await supabase.from("profiles").select("id,email,role");
const { data: links } = await supabase.from("user_bus").select("user_id,bu_id");
const buId = new Map(bus.map((b) => [b.code as string, b.id as string]));

type Plan = { row: (typeof rows)[number]; kind: "novo" | "existe" | "bloqueado"; userId?: string; last?: string | null; missing: string[]; note?: string };
const plans: Plan[] = rows.map((row) => {
  const au = authUsers.find((u) => u.email === row.email);
  const pr = au && (profiles ?? []).find((p) => p.id === au.id);
  if (au && pr && pr.role !== "head") return { row, kind: "bloqueado", missing: [], note: `já existe como ${pr.role}: não altero` };
  if (!au) return { row, kind: "novo", missing: row.buCodes };
  const has = new Set((links ?? []).filter((l) => l.user_id === au.id).map((l) => l.bu_id));
  return { row, kind: "existe", userId: au.id, last: au.last, missing: row.buCodes.filter((c) => !has.has(buId.get(c)!)) };
});

// ---------- relatório ----------
const problems = [
  ...rows.filter((r) => r.issues.length).map((r) => `linha ${r.line} (${r.name || r.email || "?"}): ${r.issues.join("; ")}`),
  ...plans.filter((p) => p.kind === "bloqueado").map((p) => `linha ${p.row.line} (${p.row.email}): ${p.note}`),
];
console.log(`Lista: ${rows.length} heads em ${new Set(rows.flatMap((r) => r.buCodes)).size} BUs.\n`);
for (const p of plans) {
  const mark = p.kind === "novo" ? "NOVO   " : p.kind === "existe" ? "EXISTE " : "BLOQ.  ";
  const extra = p.kind === "existe" ? (p.missing.length ? ` (+ BU ${p.missing.join(", ")})` : " (nada a fazer)") : "";
  console.log(`${mark} ${p.row.email.padEnd(38)} ${p.row.name.padEnd(26)} ${p.row.buCodes.join(" + ")}${extra}`);
}
const novos = plans.filter((p) => p.kind === "novo");
const reenvio = plans.filter((p) => p.kind === "existe" && reenviar && !p.last);
console.log(`\nNovos: ${novos.length} · já existentes: ${plans.filter((p) => p.kind === "existe").length}` + (reenviar ? ` · e-mails a reenviar: ${reenvio.length}` : ""));
if (!semEmail) console.log(`E-mails de convite a enviar: ${novos.length + reenvio.length} (links em ${site})`);

if (problems.length) {
  console.error("\nNão gravei nada. Corrija a planilha:\n - " + problems.join("\n - "));
  process.exit(1);
}
if (!confirm) { console.log("\nSIMULAÇÃO: nada foi gravado. Para cadastrar, rode de novo com --confirm."); process.exit(0); }

// ---------- grava ----------
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const redirectTo = `${site}/auth/confirm?next=/definir-senha`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let feitos = 0, emails = 0;
const stop = (msg: string) => { console.error(`\nParei: ${msg}\nJá feitos: ${feitos}. Rode de novo: quem já foi cadastrado só ganha o que faltar.`); process.exit(1); };

for (const p of plans) {
  const { row } = p;
  let userId = p.userId;
  if (p.kind === "novo") {
    const r = semEmail
      ? await supabase.auth.admin.createUser({ email: row.email, email_confirm: true, user_metadata: { full_name: row.name } })
      : await supabase.auth.admin.inviteUserByEmail(row.email, { data: { full_name: row.name }, redirectTo });
    if (r.error || !r.data.user) stop(`${row.email}: ${r.error?.message ?? "erro desconhecido"}${/rate limit/i.test(r.error?.message ?? "") ? " (limite de e-mails do Supabase: configure o SMTP próprio)" : ""}`);
    userId = r.data.user!.id;
    if (!semEmail) { emails++; await wait(1500); }
  }
  const up = await supabase.from("profiles").upsert({ id: userId, email: row.email, full_name: row.name, role: "head", regional: null, active: true, can_see_bu_detail: false });
  if (up.error) stop(`${row.email}: perfil: ${up.error.message}`);
  if (p.missing.length) {
    const ins = await supabase.from("user_bus").insert(p.missing.map((c) => ({ user_id: userId, bu_id: buId.get(c) })));
    if (ins.error) stop(`${row.email}: BUs: ${ins.error.message}`);
  }
  if (p.kind === "existe" && reenviar && !p.last) {
    const r = await anon.auth.resetPasswordForEmail(row.email, { redirectTo });
    if (r.error) stop(`${row.email}: reenvio: ${r.error.message}`);
    emails++; await wait(1500);
  }
  feitos++;
  console.log(`ok  ${row.email}`);
}
console.log(`\nPronto: ${feitos} heads processados, ${emails} e-mails enviados.`);
