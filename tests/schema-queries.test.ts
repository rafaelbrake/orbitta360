import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

/**
 * O TypeScript não enxerga o texto de `.select("a,b,c")`: se uma migration renomeia ou remove uma coluna,
 * a consulta só quebra em tempo de execução ("column … does not exist"). Este teste lê o código, junta
 * todas as listas de colunas citadas em `.from("tabela").select("…")` e confere cada uma no banco
 * real (todas as migrations aplicadas).
 */
const root = path.resolve(__dirname, "..");
const migrations = readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe("consultas do código × esquema do banco", () => {
  it("toda coluna citada em .from(tabela).select(colunas) existe", async () => {
    const db = new PGlite();
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
    `);
    for (const m of migrations) await db.exec(readFileSync(path.join(root, "supabase/migrations", m), "utf8"));
    const cols = (await db.query<{ table_name: string; column_name: string }>(
      "select table_name, column_name from information_schema.columns where table_schema = 'public'",
    )).rows;
    const byTable = new Map<string, Set<string>>();
    for (const c of cols) byTable.set(c.table_name, (byTable.get(c.table_name) ?? new Set()).add(c.column_name));

    const re = /\.from\("(\w+)"\)\s*\.select\(\s*"([^"]*)"/g;
    const problems: string[] = [];
    let checked = 0;
    for (const file of walk(path.join(root, "src")).concat(walk(path.join(root, "scripts")))) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(re)) {
        const [, table, list] = m;
        const known = byTable.get(table);
        if (!known) { problems.push(`${path.relative(root, file)}: tabela inexistente "${table}"`); continue; }
        if (list.trim() === "*") continue;
        for (const col of list.split(",").map((c) => c.trim()).filter(Boolean)) {
          checked++;
          if (!known.has(col)) problems.push(`${path.relative(root, file)}: ${table}.${col} não existe`);
        }
      }
    }
    await db.close();
    expect(checked).toBeGreaterThan(30); // garante que o teste está de fato lendo as consultas
    expect(problems).toEqual([]);
  });
});
