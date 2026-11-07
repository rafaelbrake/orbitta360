import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const sql = (f: string) => readFileSync(path.join(__dirname, "../supabase/migrations", f), "utf8");

describe("migration 0009: duas ondas de entrega dos heads", () => {
  it("separa os segmentos em duas ondas, ativa os quatro e define os prazos; repetir não muda nada", async () => {
    const db = new PGlite();
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
    `);
    for (const f of ["0001_schema.sql", "0002_mmt.sql", "0003_grouping.sql", "0004_offer_codes.sql", "0005_pitch_per_offer.sql", "0006_pitch_fields.sql", "0007_offers_complete.sql", "0008_offer_code_over_99.sql"]) await db.exec(sql(f));

    // como no projeto: tudo em 2027/I, Indústria e Governo desativados, prazo antigo em 16/11
    await db.exec(`
      insert into segments (name, wave, active, sort) values
        ('Saúde', '2027/I', true, 1), ('Varejo (inclui Atacado)', '2027/I', true, 2),
        ('Indústria', '2027/I', false, 3), ('Governo', '2027/I', false, 4),
        ('Educação', '2027/II', false, 6);
      insert into settings (key, value) values ('deadline_heads', '"2026-11-16"') on conflict (key) do update set value = excluded.value;
    `);

    for (let i = 0; i < 2; i++) await db.exec(sql("0009_delivery_waves.sql")); // idempotente

    const seg = Object.fromEntries((await db.query<{ name: string; wave: string; active: boolean }>("select name, wave, active from segments")).rows.map((r) => [r.name, r]));
    expect(seg["Saúde"]).toMatchObject({ wave: "Onda 1", active: true });
    expect(seg["Indústria"]).toMatchObject({ wave: "Onda 1", active: true });
    expect(seg["Varejo (inclui Atacado)"]).toMatchObject({ wave: "Onda 2", active: true });
    expect(seg["Governo"]).toMatchObject({ wave: "Onda 2", active: true });
    expect(seg["Educação"]).toMatchObject({ wave: "2027/II", active: false }); // futuro: intacto

    const st = Object.fromEntries((await db.query<{ key: string; value: string }>("select key, value from settings where key like 'deadline%'")).rows.map((r) => [r.key, r.value]));
    expect(st["deadline_wave:Onda 1"]).toBe("2026-11-12");
    expect(st["deadline_wave:Onda 2"]).toBe("2026-11-19");
    expect(st["deadline_heads"]).toBe("2026-11-19");
  });
});
