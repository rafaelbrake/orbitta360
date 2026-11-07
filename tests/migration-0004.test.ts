import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

/**
 * A migration 0004 mexe em dados que já existem (IDs vazios, repetidos, agrupamento sem ID).
 * Aqui reproduzimos esse cenário e aplicamos a 0004 por cima, como acontece no Supabase.
 */
const sql = (f: string) => readFileSync(path.join(__dirname, "../supabase/migrations", f), "utf8");

async function dbUpTo0003() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  for (const f of ["0001_schema.sql", "0002_mmt.sql", "0003_grouping.sql"]) await db.exec(sql(f));
  return db;
}

describe("migration 0004: arruma IDs existentes", () => {
  it("numera os sem ID, resolve repetidos e dá AG- aos agrupamentos, sem mexer nos IDs bons", async () => {
    const db = await dbUpTo0003();
    const bu = (await db.query<{ id: string }>("insert into bus (code,name) values ('LBL','Label') returning id")).rows[0].id;
    const bu2 = (await db.query<{ id: string }>("insert into bus (code,name) values ('PRT','Print') returning id")).rows[0].id;
    // IDs bons (fora de ordem), um repetido (mesma caixa e caixa diferente), vazios e em branco
    await db.exec(`
      insert into offers (bu_id,name,code,created_at) values
        ('${bu}','a','OF-02', now() - interval '9 min'),
        ('${bu}','b','OF-01', now() - interval '8 min'),
        ('${bu}','c','of-01', now() - interval '7 min'),   -- repetido (outra caixa): perde o ID
        ('${bu}','d',null,    now() - interval '6 min'),
        ('${bu}','e','   ',   now() - interval '5 min'),
        ('${bu}','f','OF-07', now() - interval '4 min'),
        ('${bu2}','x','OF-01', now() - interval '3 min'),
        ('${bu2}','y',null,    now() - interval '2 min');
      insert into offers (bu_id,name,is_group,created_at) values ('${bu}','Grupo sem ID', true, now() - interval '1 min');
    `);

    await db.exec(sql("0004_offer_codes.sql"));

    const rows = (await db.query<{ name: string; code: string }>("select name,code from offers order by name")).rows;
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.code]));
    expect(byName.a).toBe("OF-02");
    expect(byName.b).toBe("OF-01");
    expect(byName.f).toBe("OF-07");
    // sem ID e repetido: numerados depois do maior (OF-07), na ordem de criação
    expect(byName.c).toBe("OF-08");
    expect(byName.d).toBe("OF-09");
    expect(byName.e).toBe("OF-10");
    // outra BU tem a própria sequência
    expect(byName.x).toBe("OF-01");
    expect(byName.y).toBe("OF-02");
    // agrupamento entra na sequência AG-
    expect(byName["Grupo sem ID"]).toBe("AG-01");
    // ninguém ficou sem ID e nenhum ID se repete na BU
    expect(rows.every((r) => !!r.code)).toBe(true);
    const dup = await db.query("select bu_id, lower(code) from offers group by 1,2 having count(*) > 1");
    expect(dup.rows).toHaveLength(0);

    // e a próxima oferta continua a sequência
    const next = await db.query<{ code: string }>(`insert into offers (bu_id,name) values ('${bu}','Nova') returning code`);
    expect(next.rows[0].code).toBe("OF-11");
    await db.close();
  });

  it("funciona também com a tabela de ofertas vazia", async () => {
    const db = await dbUpTo0003();
    await db.exec(sql("0004_offer_codes.sql"));
    const bu = (await db.query<{ id: string }>("insert into bus (code,name) values ('LBL','Label') returning id")).rows[0].id;
    const r = await db.query<{ code: string }>(`insert into offers (bu_id,name) values ('${bu}','Primeira') returning code`);
    expect(r.rows[0].code).toBe("OF-01");
    await db.close();
  });
});
