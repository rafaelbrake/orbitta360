/**
 * Carga da base de produtos (planilha com as colunas "Produto" e "BU").
 *
 *   npm run load:produtos -- --file "/caminho/Produtos.xlsx"             → SIMULA: mostra o que seria criado
 *   npm run load:produtos -- --file "/caminho/Produtos.xlsx" --confirm   → grava
 *
 * - "Produto" vira o nome da oferta; a BU é reconhecida pelo nome (sem diferenciar acento ou caixa).
 * - Tipo, modelo de receita e ticket ficam em branco: os heads completam na etapa 1.
 * - O ID (OF-NN) é gerado pelo banco, na ordem da planilha, dentro de cada BU.
 * - Seguro para rodar de novo: o que já existe na BU (mesmo nome) é ignorado.
 * - Se alguma BU da planilha não existir no sistema, nada é gravado.
 */
import ExcelJS from "exceljs";
import { adminClient } from "./_client.mjs";

const args = process.argv.slice(2);
const fileIdx = args.indexOf("--file");
const file = fileIdx >= 0 ? args[fileIdx + 1] : undefined;
const confirm = args.includes("--confirm");
if (!file) {
  console.error('Informe a planilha: npm run load:produtos -- --file "/caminho/Produtos.xlsx" [--confirm]');
  process.exit(1);
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const cell = (v: unknown): string =>
  v == null ? "" : typeof v === "object" && "richText" in (v as object) ? (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("") : typeof v === "object" && "text" in (v as object) ? String((v as { text: unknown }).text) : String(v);

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const ws = wb.worksheets[0];
if (!ws) { console.error("A planilha está vazia."); process.exit(1); }

// localiza as colunas pelo cabeçalho (Produto, BU)
const header = (ws.getRow(1).values as unknown[]).slice(1).map((v) => norm(cell(v)));
const colName = header.indexOf("produto") + 1;
const colBu = header.indexOf("bu") + 1;
if (!colName || !colBu) { console.error('Cabeçalho esperado na linha 1: "Produto" e "BU".'); process.exit(1);}

const { supabase } = adminClient();
const { data: bus, error: busErr } = await supabase.from("bus").select("id,code,name");
if (busErr || !bus) { console.error("Não consegui ler as BUs:", busErr?.message); process.exit(1); }
const buByName = new Map(bus.map((b) => [norm(b.name as string), b]));

type Row = { line: number; name: string; buName: string };
const rows: Row[] = [];
for (let r = 2; r <= ws.rowCount; r++) {
  const name = clean(cell(ws.getRow(r).getCell(colName).value));
  const buName = clean(cell(ws.getRow(r).getCell(colBu).value));
  if (name || buName) rows.push({ line: r, name, buName });
}

const problems: string[] = [];
const unknown = new Set<string>();
for (const r of rows) {
  if (!r.name) problems.push(`linha ${r.line}: produto em branco`);
  else if (r.name.length > 200) problems.push(`linha ${r.line}: nome com mais de 200 caracteres`);
  if (!r.buName) problems.push(`linha ${r.line}: BU em branco`);
  else if (!buByName.has(norm(r.buName))) unknown.add(r.buName);
}
if (unknown.size) problems.push(`BUs que não existem no sistema: ${[...unknown].map((u) => `"${u}"`).join(", ")}`);
if (problems.length) {
  console.error("Não carreguei nada. Corrija a planilha:\n - " + problems.join("\n - "));
  process.exit(1);
}

// o que já existe (por BU, nome sem acento/caixa)
const { data: existing } = await supabase.from("offers").select("bu_id,name");
const have = new Set((existing ?? []).map((o) => `${o.bu_id}|${norm(o.name as string)}`));
const toInsert: { bu_id: string; name: string }[] = [];
const seen = new Set<string>();
const stats = new Map<string, { novas: number; jaExistem: number; repetidas: number }>();
for (const r of rows) {
  const bu = buByName.get(norm(r.buName))!;
  const key = `${bu.id}|${norm(r.name)}`;
  const st = stats.get(bu.code as string) ?? { novas: 0, jaExistem: 0, repetidas: 0 };
  if (have.has(key)) st.jaExistem++;
  else if (seen.has(key)) st.repetidas++;
  else { st.novas++; seen.add(key); toInsert.push({ bu_id: bu.id as string, name: r.name }); }
  stats.set(bu.code as string, st);
}

console.log(`Planilha: ${rows.length} produtos em ${stats.size} BUs.\n`);
console.log("BU    novas  já existem  repetidas na planilha");
for (const [code, st] of [...stats].sort()) console.log(`${code.padEnd(5)} ${String(st.novas).padStart(5)} ${String(st.jaExistem).padStart(10)} ${String(st.repetidas).padStart(10)}`);
console.log(`\nTotal a criar: ${toInsert.length}`);

if (!confirm) {
  console.log("\nSIMULAÇÃO: nada foi gravado. Para gravar, rode de novo com --confirm.");
  process.exit(0);
}
if (toInsert.length === 0) { console.log("Nada a criar."); process.exit(0); }

// uma a uma: o banco gera o OF-NN olhando as ofertas já gravadas, e num lote as linhas não se enxergam
let done = 0;
for (const row of toInsert) {
  const { error } = await supabase.from("offers").insert(row);
  if (error) { console.error(`Falhou em "${row.name}" (${done} já gravadas): ${error.message}\nRode de novo: o que já entrou é ignorado.`); process.exit(1); }
  done++;
  if (done % 50 === 0) console.log(`  ${done}/${toInsert.length}…`);
}
console.log(`\nPronto: ${done} ofertas criadas. Os IDs (OF-NN) foram gerados por BU, na ordem da planilha.`);
