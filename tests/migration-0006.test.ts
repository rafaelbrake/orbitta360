import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const sql = (f: string) => readFileSync(path.join(__dirname, "../supabase/migrations", f), "utf8");

describe("migration 0006: nova ficha de pitch", () => {
  it("aproveita o que já foi escrito, guarda cópia e remove os campos que saíram", async () => {
    const db = new PGlite();
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
    `);
    for (const f of ["0001_schema.sql", "0002_mmt.sql", "0003_grouping.sql", "0004_offer_codes.sql", "0005_pitch_per_offer.sql"]) await db.exec(sql(f));

    const bu = (await db.query<{ id: string }>("insert into bus (code,name) values ('PRT','Print') returning id")).rows[0].id;
    const sg = (await db.query<{ id: string }>("insert into segments (name,active) values ('Saúde', true) returning id")).rows[0].id;
    const sg2 = (await db.query<{ id: string }>("insert into segments (name,active) values ('Governo', true) returning id")).rows[0].id;
    const sg3 = (await db.query<{ id: string }>("insert into segments (name,active) values ('Varejo', true) returning id")).rows[0].id;
    const off = (await db.query<{ id: string }>(`insert into offers (bu_id,name) values ('${bu}','SOC') returning id`)).rows[0].id;
    // ficha no formato antigo: com ICP, case, aderência, sinergias e modelo em texto livre
    await db.exec(`
      insert into pitches (offer_id,segment_id,produtos_fit,dores,proposta_valor,pitch_abertura,icp,case_cliente,case_desafio,case_solucao,case_resultado,
                           sinergias_texto,potencial_modelo,potencial_ticket,potencial_expansao,aderencia_nivel,aderencia_just)
      values ('${off}','${sg}','SOC 24x7','Ataques','Reduz risco','Quanto custa uma parada?','Hospitais; CIO e CISO','Hospital X','Ransomware','SOC','Zero paradas',
              'com Cyber','Recorrente (mensal)','15000','mais licenças','Alto','ok'),
             ('${off}','${sg2}','Só descrição',null,null,null,null,null,null,null,null,null,'Projeto',null,null,null,null),
             ('${off}','${sg3}','Sem case',null,null,null,'  ',  null,null,null,null,null,null,null,null,null,null);
    `);

    await db.exec(sql("0006_pitch_fields.sql"));

    const rows = (await db.query<Record<string, unknown>>("select * from pitches order by descricao")).rows;
    const byDesc = Object.fromEntries(rows.map((r) => [r.descricao as string, r]));

    // produtos_fit virou descricao; ICP virou perfil de cliente; modelo em texto livre foi enquadrado
    expect(byDesc["SOC 24x7"]).toMatchObject({ dores: "Ataques", perfil_cliente: "Hospitais; CIO e CISO", modelo_receita: "Recorrente" });
    expect(byDesc["Só descrição"]).toMatchObject({ modelo_receita: "Pontual", cases: [] });
    // case antigo virou uma lista de 1; ICP em branco virou vazio
    expect(byDesc["SOC 24x7"].cases).toEqual([{ cliente: "Hospital X", desafio: "Ransomware", solucao: "SOC", resultado: "Zero paradas" }]);
    expect(byDesc["Sem case"]).toMatchObject({ cases: [], perfil_cliente: null });
    // campos que saíram
    for (const gone of ["produtos_fit", "icp", "sinergias_texto", "aderencia_nivel", "potencial_expansao", "case_cliente"]) expect(rows[0]).not.toHaveProperty(gone);

    // cópia de segurança com o formato antigo e o conteúdo todo
    const bk = (await db.query<{ produtos_fit: string; aderencia_nivel: string; icp: string }>("select produtos_fit,aderencia_nivel,icp from pitches_backup_0006 where produtos_fit='SOC 24x7'")).rows;
    expect(bk).toEqual([{ produtos_fit: "SOC 24x7", aderencia_nivel: "Alto", icp: "Hospitais; CIO e CISO" }]);
    // a atualização dos dados não mexeu na auditoria
    expect((await db.query("select * from audit_log where table_name='pitches'")).rows).toHaveLength(0);
    await db.close();
  });
});
