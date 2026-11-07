import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const sql = (f: string) => readFileSync(path.join(__dirname, "../supabase/migrations", f), "utf8");

describe("migration 0005: pitch por oferta × segmento", () => {
  it("guarda os pitches antigos em pitches_legacy e cria a tabela nova vazia", async () => {
    const db = new PGlite();
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
    `);
    for (const f of ["0001_schema.sql", "0002_mmt.sql", "0003_grouping.sql", "0004_offer_codes.sql"]) await db.exec(sql(f));

    const bu = (await db.query<{ id: string }>("insert into bus (code,name) values ('PRT','Print') returning id")).rows[0].id;
    const sg = (await db.query<{ id: string }>("insert into segments (name,active) values ('Saúde', true) returning id")).rows[0].id;
    await db.exec(`insert into pitches (bu_id,segment_id,produtos_fit,dores,icp) values ('${bu}','${sg}','Produto X','Dor Y','Hospitais')`);
    expect((await db.query("select * from pitches")).rows).toHaveLength(1);

    await db.exec(sql("0005_pitch_per_offer.sql"));

    // legado preservado, com o conteúdo
    const legacy = (await db.query<{ produtos_fit: string; icp: string }>("select produtos_fit,icp from pitches_legacy")).rows;
    expect(legacy).toEqual([{ produtos_fit: "Produto X", icp: "Hospitais" }]);
    // tabela nova pronta e vazia, já no formato por oferta
    expect((await db.query("select * from pitches")).rows).toHaveLength(0);
    const cols = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name='pitches'")).rows.map((r) => r.column_name);
    expect(cols).toContain("offer_id");
    // a nova tabela já aceita a mesma oferta em segmentos diferentes e rejeita repetir oferta × segmento
    const off = (await db.query<{ id: string }>(`insert into offers (bu_id,name) values ('${bu}','Oferta') returning id`)).rows[0].id;
    const sg2 = (await db.query<{ id: string }>("insert into segments (name,active) values ('Governo', true) returning id")).rows[0].id;
    await db.exec(`insert into pitches (offer_id,segment_id) values ('${off}','${sg}'),('${off}','${sg2}')`);
    await expect(db.exec(`insert into pitches (offer_id,segment_id) values ('${off}','${sg}')`)).rejects.toThrow();
    await db.close();
  });
});
