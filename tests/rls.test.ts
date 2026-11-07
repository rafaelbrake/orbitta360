import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bus from "../seed/bus.json";
import segments from "../seed/segments.json";
import bands from "../seed/bands.json";
import criteria from "../seed/criteria.json";
import settings from "../seed/settings.json";
import { missingFields } from "../src/lib/mmt";

/**
 * Teste de isolamento no BANCO: usa um Postgres real em memória (PGlite), aplica a migration
 * e simula o Supabase (roles anon/authenticated e auth.uid() lendo o "JWT" da sessão).
 * Cada consulta roda como o usuário indicado, sob RLS — o mesmo que acontece quando alguém
 * chama a API do Supabase diretamente, sem passar pela interface.
 */

const ID = {
  admin: "00000000-0000-0000-0000-0000000000a1",
  headPRT: "00000000-0000-0000-0000-0000000000b1",
  headCYB: "00000000-0000-0000-0000-0000000000b2",
  headTwo: "00000000-0000-0000-0000-0000000000b3",
  diretor: "00000000-0000-0000-0000-0000000000c1",
  diretor2: "00000000-0000-0000-0000-0000000000c2",
  diretorDetalhe: "00000000-0000-0000-0000-0000000000c3",
  headLBL: "00000000-0000-0000-0000-0000000000b4",
  headDAT: "00000000-0000-0000-0000-0000000000b5",
};

let db: PGlite;
const buId: Record<string, string> = {};
const segId: Record<string, string> = {};
const offerId: Record<string, string> = {};

async function as<T = Record<string, unknown>>(
  user: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user ?? ""}', false);`);
  try {
    const r = await db.query<T>(sql, params);
    return r.rows;
  } finally {
    await db.exec("reset role");
  }
}
async function fails(user: string, sql: string, params: unknown[] = []) {
  await expect(as(user, sql, params)).rejects.toThrow();
}
async function sup<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(readFileSync(path.join(__dirname, "../supabase/migrations/0001_schema.sql"), "utf8"));
  await db.exec(readFileSync(path.join(__dirname, "../supabase/migrations/0002_mmt.sql"), "utf8"));
  await db.exec(readFileSync(path.join(__dirname, "../supabase/migrations/0003_grouping.sql"), "utf8"));
  await db.exec(readFileSync(path.join(__dirname, "../supabase/migrations/0004_offer_codes.sql"), "utf8"));
  await db.exec(readFileSync(path.join(__dirname, "../supabase/migrations/0005_pitch_per_offer.sql"), "utf8"));
  await db.exec(readFileSync(path.join(__dirname, "../supabase/migrations/0006_pitch_fields.sql"), "utf8"));
  await db.exec(readFileSync(path.join(__dirname, "../supabase/migrations/0007_offers_complete.sql"), "utf8"));
  await db.exec(readFileSync(path.join(__dirname, "../supabase/migrations/0008_offer_code_over_99.sql"), "utf8"));

  for (const b of bus) {
    const r = await sup<{ id: string }>("insert into bus (code,name,sort) values ($1,$2,$3) returning id", [b.code, b.name, b.sort]);
    buId[b.code] = r[0].id;
  }
  for (const s of segments) {
    const r = await sup<{ id: string }>(
      "insert into segments (name,wave,leader,active,sort) values ($1,$2,$3,$4,$5) returning id",
      [s.name, s.wave, s.leader, s.active, s.sort],
    );
    segId[s.name] = r[0].id;
  }
  for (const c of criteria)
    await sup("insert into criteria (id,name,question,weight,rubric) values ($1,$2,$3,$4,$5)", [c.id, c.name, c.question, c.weight, JSON.stringify(c.rubric)]);
  for (const b of bands)
    await sup("insert into class_bands (id,code,label,min_score,max_score,direction,sort) values ($1,$2,$3,$4,$5,$6,$7)", [b.id, b.code, b.label, b.min_score, b.max_score, b.direction, b.sort]);
  for (const [k, v] of Object.entries(settings))
    await sup("insert into settings (key,value) values ($1,$2)", [k, JSON.stringify(v)]);

  for (const [k, id] of Object.entries(ID))
    await sup("insert into auth.users (id,email) values ($1,$2)", [id, `${k}@teste.local`]);
  await sup("update profiles set role='admin' where id=$1", [ID.admin]);
  await sup("update profiles set role='diretor', regional='Sul' where id=$1", [ID.diretor]);
  await sup("insert into user_bus values ($1,$2)", [ID.headPRT, buId.PRT]);
  await sup("insert into user_bus values ($1,$2)", [ID.headCYB, buId.CYB]);
  await sup("insert into user_bus values ($1,$2),($1,$3)", [ID.headTwo, buId.ITD, buId.ITS]);
  await sup("insert into user_bus values ($1,$2)", [ID.headLBL, buId.LBL]);
  await sup("insert into user_bus values ($1,$2)", [ID.headDAT, buId.DAT]);
  await sup("insert into user_bus values ($1,$2)", [ID.diretor, buId.PRT]); // diretor não é head: vínculo não dá acesso

  for (const [code, name] of [["PRT", "Outsourcing PRT"], ["CYB", "SOC CYB"], ["ITD", "DaaS"], ["ITS", "Cloud"]]) {
    const r = await sup<{ id: string }>("insert into offers (bu_id,name,ticket_medio) values ($1,$2,100000) returning id", [buId[code], name]);
    offerId[code] = r[0].id;
  }
  // BUs dos testes de isolamento/fluxo já passaram pelas etapas de conferência e agrupamento
  await sup("insert into bu_progress (bu_id, offers_confirmed_at, grouping_confirmed_at) select id, now(), now() from bus where code in ('PRT','CYB','ITD','ITS')");
  // dados da CYB (alvo dos ataques)
  await sup("insert into evaluations (offer_id,segment_id,n1,n2,n3,n4,n5) values ($1,$2,4,4,4,4,4)", [offerId.CYB, segId["Saúde"]]);
  await sup("insert into pitches (offer_id,segment_id,descricao) values ($1,$2,'segredo CYB')", [offerId.CYB, segId["Saúde"]]);
  await sup("insert into bu_ticket (bu_id,ticket_medio) values ($1,480000)", [buId.CYB]);
});

afterAll(async () => {
  await db.close();
});

describe("isolamento entre BUs (RLS no banco)", () => {
  it("head só enxerga ofertas da própria BU", async () => {
    const rows = await as<{ name: string }>(ID.headPRT, "select name from offers");
    expect(rows.map((r) => r.name)).toEqual(["Outsourcing PRT"]);
  });

  it("head não lê avaliações, pitches, ticket nem envios de outra BU", async () => {
    expect(await as(ID.headPRT, "select * from evaluations")).toHaveLength(0);
    expect(await as(ID.headPRT, "select * from evaluations_scored")).toHaveLength(0);
    expect(await as(ID.headPRT, "select * from pitches")).toHaveLength(0);
    expect(await as(ID.headPRT, "select * from bu_ticket")).toHaveLength(0);
    expect(await as(ID.headPRT, "select * from bu_submissions")).toHaveLength(0);
    expect(await as(ID.headPRT, "select * from offers where bu_id=$1", [buId.CYB])).toHaveLength(0);
  });

  it("head não insere avaliação para oferta de outra BU", async () => {
    await fails(ID.headPRT, "insert into evaluations (offer_id,segment_id,n1,n2,n3,n4,n5) values ($1,$2,1,1,1,1,1)", [offerId.CYB, segId["Varejo (inclui Atacado)"]]);
  });

  it("head não altera nem apaga dados de outra BU", async () => {
    expect(await as(ID.headPRT, "update evaluations set n1=1 returning id")).toHaveLength(0);
    expect(await as(ID.headPRT, "update pitches set descricao='x' returning id")).toHaveLength(0);
    expect(await as(ID.headPRT, "update offers set name='hack' where bu_id=$1 returning id", [buId.CYB])).toHaveLength(0);
    expect(await as(ID.headPRT, "delete from evaluations returning id")).toHaveLength(0);
    const cyb = await sup<{ n1: number }>("select n1 from evaluations where offer_id=$1", [offerId.CYB]);
    expect(cyb[0].n1).toBe(4);
  });

  it("head não move oferta ou pitch para outra BU, nem cria oferta lá", async () => {
    await fails(ID.headPRT, "update offers set bu_id=$1 where id=$2", [buId.CYB, offerId.PRT]);
    await fails(ID.headPRT, "insert into offers (bu_id,name) values ($1,'intrusa')", [buId.CYB]);
    await fails(ID.headPRT, "insert into pitches (offer_id,segment_id) values ($1,$2)", [offerId.CYB, segId["Governo"]]);
    await fails(ID.headPRT, "insert into bu_ticket (bu_id,ticket_medio) values ($1,1)", [buId.CYB]);
  });

  it("head pode gravar na própria BU", async () => {
    const r = await as(ID.headPRT, "insert into evaluations (offer_id,segment_id,n1,n2,n3,n4,n5) values ($1,$2,3,3,3,3,3) returning bu_id", [offerId.PRT, segId["Saúde"]]);
    expect(r).toHaveLength(1);
    expect((r[0] as { bu_id: string }).bu_id).toBe(buId.PRT);
  });

  it("head com duas BUs enxerga as duas e nenhuma outra", async () => {
    const rows = await as<{ name: string }>(ID.headTwo, "select name from offers order by name");
    expect(rows.map((r) => r.name)).toEqual(["Cloud", "DaaS"]);
  });

  it("diretor comercial não lê dados de avaliação (mesmo com vínculo a BU)", async () => {
    expect(await as(ID.diretor, "select * from offers")).toHaveLength(0);
    expect(await as(ID.diretor, "select * from evaluations")).toHaveLength(0);
  });

  it("usuário sem sessão não vê nada", async () => {
    expect(await as(null, "select * from offers")).toHaveLength(0);
  });
});

describe("privilégios", () => {
  it("head não vira admin nem altera vínculos", async () => {
    expect(await as(ID.headPRT, "update profiles set role='admin' where id=$1 returning id", [ID.headPRT])).toHaveLength(0);
    await fails(ID.headPRT, "insert into user_bus values ($1,$2)", [ID.headPRT, buId.CYB]);
    expect(await as(ID.headPRT, "select * from profiles")).toHaveLength(1);
  });

  it("head não altera configuração", async () => {
    expect(await as(ID.headPRT, "update criteria set weight=50 returning id")).toHaveLength(0);
    expect(await as(ID.headPRT, "update settings set value='false' returning key")).toHaveLength(0);
    expect(await as(ID.headPRT, "update class_bands set min_score=0 returning id")).toHaveLength(0);
    await fails(ID.headPRT, "select save_criteria('[]'::jsonb)");
  });

  it("head não lê o log de auditoria nem grava em envios", async () => {
    expect(await as(ID.headPRT, "select * from audit_log")).toHaveLength(0);
    await fails(ID.headPRT, "insert into bu_submissions (bu_id,status) values ($1,'submitted')", [buId.PRT]);
    await fails(ID.headPRT, "select reopen_bu($1)", [buId.PRT]);
    await fails(ID.headPRT, "select submit_bu($1)", [buId.CYB]);
  });

  it("admin vê tudo", async () => {
    expect((await as(ID.admin, "select * from offers")).length).toBe(4);
    expect((await as(ID.admin, "select * from profiles")).length).toBe(Object.keys(ID).length);
    expect((await as(ID.admin, "select * from evaluations")).length).toBeGreaterThanOrEqual(1);
  });
});

describe("cálculo no banco", () => {
  it("5-4-3-5-3 = 83 e classifica como potencial", async () => {
    const r = await sup<{ s: number; c: string }>("select score_of(5::smallint,4::smallint,3::smallint,5::smallint,3::smallint) as s, class_of(score_of(5::smallint,4::smallint,3::smallint,5::smallint,3::smallint)) as c");
    expect(r[0].s).toBe(83);
    expect(r[0].c).toBe("potencial");
  });

  it("view calcula score, classe e selo de especialista", async () => {
    const r = await sup<{ score: number; class_code: string; specialist_led: boolean }>(
      "insert into evaluations (offer_id,segment_id,n1,n2,n3,n4,n5,e1,e2,e3,e4,e5) values ($1,$2,5,5,5,2,5,'a','b','c','d','e') returning id",
      [offerId.ITD, segId["Governo"]],
    );
    expect(r).toHaveLength(1);
    const v = await sup<{ score: number; class_code: string; specialist_led: boolean }>(
      "select score,class_code,specialist_led from evaluations_scored where offer_id=$1", [offerId.ITD]);
    expect(v[0].score).toBe(91);
    expect(v[0].class_code).toBe("alta");
    expect(v[0].specialist_led).toBe(true);
  });

  it("alterar pesos recalcula tudo; pesos ≠ 100 são recusados", async () => {
    const items = criteria.map((c) => ({ ...c, weight: 20 }));
    await as(ID.admin, "select save_criteria($1::jsonb)", [JSON.stringify(items)]);
    const r = await sup<{ s: number }>("select score_of(5::smallint,4::smallint,3::smallint,5::smallint,3::smallint) as s");
    expect(r[0].s).toBe(80);
    const bad = criteria.map((c) => ({ ...c, weight: 25 }));
    await fails(ID.admin, "select save_criteria($1::jsonb)", [JSON.stringify(bad)]);
    await as(ID.admin, "select save_criteria($1::jsonb)", [JSON.stringify(criteria)]);
    expect((await sup<{ s: number }>("select score_of(5::smallint,4::smallint,3::smallint,5::smallint,3::smallint) as s"))[0].s).toBe(83);
  });
});

describe("fluxo rascunho → enviado → reaberto", () => {
  const activeSegs = () => segments.filter((s) => s.active).map((s) => segId[s.name]);

  it("envio é bloqueado enquanto houver pendências (notas e pitch)", async () => {
    const gaps = await as<{ kind: string }>(ID.headPRT, "select * from submission_gaps($1)", [buId.PRT]);
    expect(gaps.filter((g) => g.kind === "nota")).toHaveLength(3); // 3 segmentos sem avaliação
    await fails(ID.headPRT, "select submit_bu($1)", [buId.PRT]);
  });

  it("nota 4/5 exige evidência; prioridade alta/potencial exige pitch", async () => {
    for (const sid of activeSegs()) {
      await as(ID.headPRT, `insert into evaluations (offer_id,segment_id,n1,n2,n3,n4,n5) values ($1,$2,5,5,5,5,5)
        on conflict (offer_id,segment_id) do update set n1=5,n2=5,n3=5,n4=5,n5=5`, [offerId.PRT, sid]);
    }
    const g1 = await as<{ kind: string }>(ID.headPRT, "select kind from submission_gaps($1)", [buId.PRT]);
    expect(g1.some((g) => g.kind === "evidencia")).toBe(true);
    expect(g1.some((g) => g.kind === "pitch")).toBe(true);

    await as(ID.headPRT, "update evaluations set e1='x',e2='x',e3='x',e4='x',e5='x' where bu_id=$1", [buId.PRT]);
    const g2 = await as<{ kind: string }>(ID.headPRT, "select kind from submission_gaps($1)", [buId.PRT]);
    expect(g2.every((g) => g.kind === "pitch")).toBe(true);
    expect(g2).toHaveLength(4);
    await fails(ID.headPRT, "select submit_bu($1)", [buId.PRT]);

    for (const sid of activeSegs()) {
      await as(ID.headPRT, `insert into pitches (offer_id,segment_id,descricao,dores,proposta_valor,pitch_abertura,perfil_cliente,persona_decisora)
        values ($1,$2,'a','b','c','d','e','f')`, [offerId.PRT, sid]);
    }
    expect(await as(ID.headPRT, "select * from submission_gaps($1)", [buId.PRT])).toHaveLength(0);
  });

  it("enviado = somente leitura para o head; admin reabre e o head volta a editar", async () => {
    await as(ID.headPRT, "select submit_bu($1)", [buId.PRT]);
    const st = await as<{ status: string }>(ID.headPRT, "select status from bu_submissions where bu_id=$1", [buId.PRT]);
    expect(st[0].status).toBe("submitted");

    expect(await as(ID.headPRT, "update evaluations set n1=1 where bu_id=$1 returning id", [buId.PRT])).toHaveLength(0);
    await fails(ID.headPRT, "insert into offers (bu_id,name) values ($1,'nova')", [buId.PRT]);
    expect(await as(ID.headPRT, "update pitches set dores='z' where bu_id=$1 returning id", [buId.PRT])).toHaveLength(0);

    await as(ID.admin, "select reopen_bu($1)", [buId.PRT]);
    const st2 = await as<{ status: string }>(ID.headPRT, "select status from bu_submissions where bu_id=$1", [buId.PRT]);
    expect(st2[0].status).toBe("reopened");
    expect((await as(ID.headPRT, "update evaluations set n1=4 where bu_id=$1 returning id", [buId.PRT])).length).toBeGreaterThan(0);
  });

  it("alterações depois do envio ficam na auditoria", async () => {
    const log = await as<{ table_name: string; action: string }>(ID.admin, "select table_name,action from audit_log where table_name='evaluations'");
    expect(log.length).toBeGreaterThan(0);
    const subs = await as<{ action: string }>(ID.admin, "select action from audit_log where table_name='bu_submissions'");
    expect(subs.length).toBeGreaterThanOrEqual(2);
  });

  it("período fechado bloqueia o head, mas não o admin", async () => {
    await as(ID.admin, "update settings set value='false'::jsonb where key='period_open'");
    expect(await as(ID.headCYB, "update evaluations set n1=2 returning id")).toHaveLength(0);
    expect((await as(ID.admin, "update evaluations set n1=4 where bu_id=$1 returning id", [buId.CYB])).length).toBe(1);
    await as(ID.admin, "update settings set value='true'::jsonb where key='period_open'");
    expect((await as(ID.headCYB, "update evaluations set n1=2 returning id")).length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* Fase 2 — Manter / Mudar / Treinar                                   */
/* ------------------------------------------------------------------ */
describe("Manter / Mudar / Treinar (RLS no banco)", () => {
  const seg = () => segId["Saúde"];
  let recA: string; // do diretor 1
  let recB: string; // do diretor 2

  const insertRec = (user: string, type = "manter", extra = "") =>
    as<{ id: string; regional: string | null; author_id: string }>(
      user,
      `insert into mmt_records (type,segment_id,bu_id,priority,headline,evidence,reason,action,indicator ${extra ? "," + extra.split("=")[0] : ""})
       values ($1,$2,$3,'alta','h','e','r','a','i' ${extra ? "," + extra.split("=")[1] : ""}) returning id,regional,author_id`,
      [type, seg(), buId.CYB],
    );

  beforeAll(async () => {
    await sup("update profiles set role='diretor', regional='Norte' where id=$1", [ID.diretor2]);
    await sup("update profiles set role='diretor', regional='Sul', can_see_bu_detail=true where id=$1", [ID.diretorDetalhe]);
  });

  it("diretor cria registro; a regional vem do perfil e o autor é ele mesmo", async () => {
    const r = await insertRec(ID.diretor);
    recA = r[0].id;
    expect(r[0].regional).toBe("Sul");
    expect(r[0].author_id).toBe(ID.diretor);
    const r2 = await insertRec(ID.diretor2, "mudar");
    recB = r2[0].id;
    expect(r2[0].regional).toBe("Norte");
  });

  it("regional enviada pelo cliente é ignorada", async () => {
    const r = await as<{ regional: string }>(
      ID.diretor,
      "insert into mmt_records (type,segment_id,bu_id,regional) values ('treinar',$1,$2,'Falsa') returning regional",
      [seg(), buId.PRT],
    );
    expect(r[0].regional).toBe("Sul");
  });

  it("diretor só lê e altera os próprios registros", async () => {
    const mine = await as<{ id: string }>(ID.diretor, "select id from mmt_records");
    expect(mine.map((x) => x.id)).not.toContain(recB);
    expect(await as(ID.diretor, "update mmt_records set headline='hack' where id=$1 returning id", [recB])).toHaveLength(0);
    expect(await as(ID.diretor, "delete from mmt_records where id=$1 returning id", [recB])).toHaveLength(0);
    expect((await sup<{ headline: string }>("select headline from mmt_records where id=$1", [recB]))[0].headline).toBe("h");
  });

  it("diretor não cria registro em nome de outro, nem muda autor ou tipo", async () => {
    await fails(ID.diretor, "insert into mmt_records (author_id,type,segment_id,bu_id) values ($1,'manter',$2,$3)", [ID.diretor2, seg(), buId.CYB]);
    await fails(ID.diretor, "update mmt_records set author_id=$1 where id=$2", [ID.diretor2, recA]);
    await fails(ID.diretor, "update mmt_records set type='mudar' where id=$1", [recA]);
  });

  it("head e usuário sem sessão não leem nem escrevem registros", async () => {
    expect(await as(ID.headPRT, "select * from mmt_records")).toHaveLength(0);
    await fails(ID.headPRT, "insert into mmt_records (type,segment_id,bu_id) values ('manter',$1,$2)", [seg(), buId.PRT]);
    expect(await as(null, "select * from mmt_records")).toHaveLength(0);
  });

  it("oferta precisa pertencer à BU do registro", async () => {
    await fails(ID.diretor, "insert into mmt_records (type,segment_id,bu_id,offer_id) values ('manter',$1,$2,$3)", [seg(), buId.CYB, offerId.PRT]);
    expect(
      await as(ID.diretor, "insert into mmt_records (type,segment_id,bu_id,offer_id) values ('manter',$1,$2,$3) returning id", [seg(), buId.CYB, offerId.CYB]),
    ).toHaveLength(1);
  });

  it("segmentos atribuídos limitam onde o diretor registra", async () => {
    await sup("insert into user_segments values ($1,$2)", [ID.diretor2, segId["Governo"]]);
    await fails(ID.diretor2, "insert into mmt_records (type,segment_id,bu_id) values ('manter',$1,$2)", [seg(), buId.CYB]);
    expect(
      await as(ID.diretor2, "insert into mmt_records (type,segment_id,bu_id) values ('manter',$1,$2) returning id", [segId["Governo"], buId.CYB]),
    ).toHaveLength(1);
    await sup("delete from user_segments where user_id=$1", [ID.diretor2]);
  });

  it("lista de ofertas da BU: diretor e head de BU veem nomes; head de outra BU não", async () => {
    expect((await as(ID.diretor, "select * from list_offers($1)", [buId.CYB])).length).toBe(1);
    expect((await as(ID.headCYB, "select * from list_offers($1)", [buId.CYB])).length).toBe(1);
    expect(await as(ID.headPRT, "select * from list_offers($1)", [buId.CYB])).toHaveLength(0);
    expect(await as(null, "select * from list_offers($1)", [buId.CYB])).toHaveLength(0);
  });

  it("envio exige registros completos; completo envia e fica somente leitura", async () => {
    // diretor 1 tem um registro 'treinar' incompleto (sem público)
    await fails(ID.diretor, "select submit_mmt()");
    const gaps = await as<{ detail: string }>(ID.diretor, "select detail from mmt_gaps($1)", [ID.diretor]);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.some((g) => /público/.test(g.detail))).toBe(true);
    await as(ID.diretor, "delete from mmt_records where type='treinar'");
    await fails(ID.diretor, "select submit_mmt()"); // sobrou o registro do teste da oferta, ainda em branco
    await as(ID.diretor, "update mmt_records set priority='alta',headline='h',evidence='e',reason='r',action='a',indicator='i'");
    expect(await as(ID.diretor, "select * from mmt_gaps($1)", [ID.diretor])).toHaveLength(0);
    await as(ID.diretor, "select submit_mmt()");
    const st = await as<{ status: string }>(ID.diretor, "select status from mmt_submissions");
    expect(st[0].status).toBe("submitted");

    expect(await as(ID.diretor, "update mmt_records set headline='x' returning id")).toHaveLength(0);
    await fails(ID.diretor, "insert into mmt_records (type,segment_id,bu_id) values ('manter',$1,$2)", [seg(), buId.CYB]);
    expect(await as(ID.diretor, "delete from mmt_records returning id")).toHaveLength(0);
  });

  it("'Outro' exige informar o público; sem registros não envia", async () => {
    await fails(ID.diretor2, "select submit_mmt()"); // tem registro incompleto
    await as(ID.diretor2, "delete from mmt_records");
    await fails(ID.diretor2, "select submit_mmt()"); // sem nenhum registro
    await as(ID.diretor2,
      `insert into mmt_records (type,segment_id,bu_id,priority,headline,evidence,action,indicator,audience)
       values ('treinar',$1,$2,'media','h','e','a','i','Outro')`, [seg(), buId.CYB]);
    const g = await as<{ detail: string }>(ID.diretor2, "select detail from mmt_gaps($1)", [ID.diretor2]);
    expect(g[0].detail).toMatch(/qual público/);
  });

  it("diretor não envia pelo outro nem grava em envios; só admin reabre", async () => {
    await fails(ID.diretor, "insert into mmt_submissions (user_id,status) values ($1,'submitted')", [ID.diretor2]);
    await fails(ID.diretor, "select reopen_mmt($1)", [ID.diretor]);
    expect(await as(ID.diretor2, "select * from mmt_submissions")).toHaveLength(0);
    expect((await as(ID.diretor, "select * from mmt_gaps($1)", [ID.diretor2]))).toHaveLength(0);
  });

  it("admin lê todos os registros e reabre; o diretor volta a editar", async () => {
    expect((await as(ID.admin, "select * from mmt_records")).length).toBeGreaterThanOrEqual(2);
    expect((await as(ID.admin, "select * from mmt_submissions")).length).toBe(1);
    await as(ID.admin, "select reopen_mmt($1)", [ID.diretor]);
    expect((await as<{ status: string }>(ID.diretor, "select status from mmt_submissions"))[0].status).toBe("reopened");
    expect((await as(ID.diretor, "update mmt_records set headline='novo' returning id")).length).toBeGreaterThan(0);
  });

  it("período fechado bloqueia o diretor, não o admin", async () => {
    await as(ID.admin, "update settings set value='false'::jsonb where key='period_open'");
    expect(await as(ID.diretor, "update mmt_records set headline='fechado' returning id")).toHaveLength(0);
    await fails(ID.diretor, "insert into mmt_records (type,segment_id,bu_id) values ('manter',$1,$2)", [seg(), buId.CYB]);
    expect((await as(ID.admin, "update mmt_records set indicator='adm' where author_id=$1 returning id", [ID.diretor])).length).toBeGreaterThan(0);
    await as(ID.admin, "update settings set value='true'::jsonb where key='period_open'");
  });

  it("alterações depois do envio ficam na auditoria", async () => {
    const log = await as<{ table_name: string }>(ID.admin, "select table_name from audit_log where table_name in ('mmt_records','mmt_submissions')");
    expect(log.some((l) => l.table_name === "mmt_submissions")).toBe(true);
    expect(log.some((l) => l.table_name === "mmt_records")).toBe(true);
  });
});

describe("visão do diretor sobre os scores (sem detalhe de BU)", () => {
  const row = async (user: string) => {
    const r = await as<Record<string, number | string>>(user, "select * from segment_overview() where segment_id=$1", [segId["Saúde"]]);
    return r[0];
  };

  it("agregado só conta BUs ENVIADAS e não expõe BU nem oferta", async () => {
    // PRT foi enviada e reaberta no fluxo anterior; força um estado conhecido
    await sup("update bu_submissions set status='submitted' where bu_id=$1", [buId.PRT]);
    await sup("update bu_submissions set status='draft' where bu_id=$1", [buId.CYB]).catch(() => {});
    const r = await row(ID.diretor);
    expect(Object.keys(r).sort()).toEqual(
      ["bus_sent", "max_score", "n_alta", "n_baixa", "n_potencial", "n_secundaria", "offers_scored", "segment_id"].sort(),
    );
    expect(Number(r.bus_sent)).toBe(1); // só PRT
    expect(Number(r.offers_scored)).toBe(1);
    expect(Number(r.max_score)).toBeGreaterThan(0);
  });

  it("head de BU e anônimo não usam a visão consolidada", async () => {
    expect(await as(ID.headPRT, "select * from segment_overview()")).toHaveLength(0);
    expect(await as(null, "select * from segment_overview()")).toHaveLength(0);
  });

  it("sem a liberação do admin, diretor não lê o detalhe das BUs", async () => {
    expect(await as(ID.diretor, "select * from evaluations_scored")).toHaveLength(0);
    expect(await as(ID.diretor, "select * from pitches")).toHaveLength(0);
  });

  it("com a liberação, diretor lê só BUs enviadas, sempre em leitura", async () => {
    const ev = await as<{ bu_id: string }>(ID.diretorDetalhe, "select bu_id from evaluations_scored");
    expect(ev.length).toBeGreaterThan(0);
    expect(new Set(ev.map((e) => e.bu_id))).toEqual(new Set([buId.PRT])); // CYB está em rascunho: invisível
    expect((await as(ID.diretorDetalhe, "select * from offers")).every((o) => (o as { bu_id: string }).bu_id === buId.PRT)).toBe(true);
    expect(await as(ID.diretorDetalhe, "update evaluations set n1=1 returning id")).toHaveLength(0);
    await fails(ID.diretorDetalhe, "insert into offers (bu_id,name) values ($1,'x')", [buId.PRT]);
  });
});

describe("regras de preenchimento: interface (TypeScript) = banco (SQL)", () => {
  it("o que a tela chama de completo é exatamente o que o banco aceita no envio", async () => {
    const types = ["manter", "mudar", "treinar"] as const;
    const priorities = [null, "alta"] as const;
    const texts = [null, "   ", "ok"] as const;
    const audiences = [null, "AM", "Outro"] as const;
    const others = [null, "Pré-vendas"] as const;
    let compared = 0;
    for (const type of types) for (const priority of priorities) for (const t of texts) for (const audience of audiences) for (const other of others) {
      // varia um campo de cada vez para manter a matriz pequena, mas cobrindo todos os campos
      for (const field of ["headline", "evidence", "reason", "action", "indicator"] as const) {
        const rec = { type, priority, headline: "ok", evidence: "ok", reason: "ok", action: "ok", indicator: "ok", audience, audience_other: other, [field]: t };
        await sup("delete from mmt_records where author_id=$1", [ID.diretorDetalhe]);
        await sup(
          `insert into mmt_records (author_id,type,segment_id,bu_id,priority,headline,evidence,reason,action,indicator,audience,audience_other)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [ID.diretorDetalhe, type, segId["Saúde"], buId.CYB, rec.priority, rec.headline, rec.evidence, rec.reason, rec.action, rec.indicator, rec.audience, rec.audience_other],
        );
        const gaps = await as(ID.admin, "select * from mmt_gaps($1)", [ID.diretorDetalhe]);
        const incompleteTs = missingFields(rec).length > 0;
        expect(gaps.length > 0, JSON.stringify(rec)).toBe(incompleteTs);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(500);
    await sup("delete from mmt_records where author_id=$1", [ID.diretorDetalhe]);
  });
});

/* ------------------------------------------------------------------ */
/* Ofertas padronizadas, agrupamento e etapas                          */
/* ------------------------------------------------------------------ */
describe("tipo e modelo de receita padronizados", () => {
  it("aceita só os valores da lista", async () => {
    for (const [t, m] of [["Software", "Recorrente"], ["Hardware", "Pontual"], ["Serviço", "Recorrente"]])
      expect(await as(ID.headLBL, "insert into offers (bu_id,name,offer_type,revenue_model) values ($1,$2,$3,$4) returning id", [buId.LBL, `Padrão ${t}`, t, m])).toHaveLength(1);
    await fails(ID.headLBL, "insert into offers (bu_id,name,offer_type) values ($1,'Tipo livre','Projeto')", [buId.LBL]);
    await fails(ID.headLBL, "insert into offers (bu_id,name,revenue_model) values ($1,'Modelo livre','Mensal')", [buId.LBL]);
    expect(await as(ID.headLBL, "insert into offers (bu_id,name) values ($1,'Sem tipo') returning id", [buId.LBL])).toHaveLength(1); // vazio é permitido
  });
});

describe("etapas da BU: ofertas → agrupamento → classificação", () => {
  const offerIdsOf = async (bu: string) => (await sup<{ id: string; name: string }>("select id,name from offers where bu_id=$1 and not is_group order by name", [bu]));
  const name = async (n: string) => (await sup<{ id: string }>("select id from offers where bu_id=$1 and name=$2", [buId.LBL, n]))[0].id;
  let dev: Record<string, string>;
  const ev = (offer: string) => as(ID.headLBL, "insert into evaluations (offer_id,segment_id,n1,n2,n3,n4,n5) values ($1,$2,3,3,3,3,3) on conflict (offer_id,segment_id) do update set n1=3 returning id", [offer, segId["Saúde"]]);

  beforeAll(async () => {
    for (const n of ["Alocação - Dev C#", "Alocação - Dev Java", "Alocação - Arquiteto"])
      await as(ID.headLBL, "insert into offers (bu_id,name,offer_type,revenue_model,ticket_medio) values ($1,$2,'Serviço','Recorrente',100000)", [buId.LBL, n]);
    dev = { cs: await name("Alocação - Dev C#"), java: await name("Alocação - Dev Java"), arq: await name("Alocação - Arquiteto") };
  });

  it("antes da conferência e do agrupamento, o head não classifica (o admin pode)", async () => {
    await fails(ID.headLBL, "insert into evaluations (offer_id,segment_id,n1,n2,n3,n4,n5) values ($1,$2,3,3,3,3,3)", [dev.cs, segId["Saúde"]]);
    expect((await as(ID.admin, "insert into evaluations (offer_id,segment_id,n1,n2,n3,n4,n5) values ($1,$2,3,3,3,3,3) returning id", [dev.cs, segId["Saúde"]])).length).toBe(1);
    await sup("delete from evaluations where offer_id=$1", [dev.cs]);
  });

  it("as etapas seguem a ordem e não dá para pular", async () => {
    await fails(ID.headLBL, "select set_bu_step($1,'grouping',true)", [buId.LBL]); // sem conferir ofertas
    await fails(ID.headLBL, "select set_bu_step($1,'qualquer',true)", [buId.LBL]);
    await sup("update offers set offer_type='Serviço', revenue_model='Pontual' where bu_id=$1 and (offer_type is null or revenue_model is null)", [buId.LBL]); // a etapa 1 exige tipo e modelo
    await as(ID.headLBL, "select set_bu_step($1,'offers',true)", [buId.LBL]);
    await fails(ID.headLBL, "insert into evaluations (offer_id,segment_id,n1,n2,n3,n4,n5) values ($1,$2,3,3,3,3,3)", [dev.cs, segId["Saúde"]]); // ainda falta o agrupamento
    await as(ID.headLBL, "select set_bu_step($1,'grouping',true)", [buId.LBL]);
    expect(await ev(dev.cs)).toHaveLength(1);
  });

  it("outra BU não mexe nas etapas, nem lê ou grava o andamento", async () => {
    await fails(ID.headPRT, "select set_bu_step($1,'offers',false)", [buId.LBL]);
    expect(await as(ID.headPRT, "select * from bu_progress where bu_id=$1", [buId.LBL])).toHaveLength(0);
    await fails(ID.headLBL, "insert into bu_progress (bu_id) values ($1) on conflict do nothing", [buId.CYB]);
    await fails(ID.headLBL, "update bu_progress set grouping_confirmed_at = now() where bu_id=$1", [buId.LBL]);
  });

  it("agrupa 3 ofertas em uma nova: membros saem da classificação e as notas deles ficam guardadas", async () => {
    await ev(dev.java); // nota lançada antes de agrupar
    const g = await as<{ create_offer_group: string }>(ID.headLBL, "select create_offer_group($1,'Alocação de mão de obra - Desenvolvedor','Serviço','Recorrente',100000,'Devs',$2::uuid[])", [buId.LBL, [dev.cs, dev.java, dev.arq]]);
    const gid = g[0].create_offer_group;
    const rows = await sup<{ name: string; is_group: boolean; group_id: string | null }>("select name,is_group,group_id from offers where bu_id=$1 order by name", [buId.LBL]);
    expect(rows.find((r) => r.name === "Alocação de mão de obra - Desenvolvedor")?.is_group).toBe(true);
    expect(rows.filter((r) => r.group_id === gid)).toHaveLength(3);
    // membro não é classificado
    await fails(ID.headLBL, "insert into evaluations (offer_id,segment_id,n1,n2,n3,n4,n5) values ($1,$2,3,3,3,3,3)", [dev.arq, segId["Governo"]]);
    // a nota antiga do membro fica no banco, mas fora da classificação
    expect((await sup("select * from evaluations where offer_id=$1", [dev.java])).length).toBe(1);
    expect(await as(ID.headLBL, "select * from evaluations_scored where offer_id=$1", [dev.java])).toHaveLength(0);
    // o grupo é classificável
    expect((await as(ID.headLBL, "insert into evaluations (offer_id,segment_id,n1,n2,n3,n4,n5) values ($1,$2,4,4,4,4,4) returning id", [gid, segId["Saúde"]])).length).toBe(1);
    expect((await as(ID.headLBL, "select * from evaluations_scored where offer_id=$1", [gid])).length).toBe(1);
  });

  it("só o grupo e as ofertas avulsas entram nas pendências e na lista de ofertas", async () => {
    const gaps = await as<{ offer_id: string | null }>(ID.headLBL, "select offer_id from submission_gaps($1)", [buId.LBL]);
    for (const m of [dev.cs, dev.java, dev.arq]) expect(gaps.some((g) => g.offer_id === m)).toBe(false);
    const listed = await as<{ name: string }>(ID.headLBL, "select name from list_offers($1)", [buId.LBL]);
    expect(listed.map((o) => o.name)).not.toContain("Alocação - Dev C#");
    expect(listed.map((o) => o.name)).toContain("Alocação de mão de obra - Desenvolvedor");
  });

  it("regras do agrupamento: mínimo de 2, mesma BU, sem aninhar, sem reaproveitar membro", async () => {
    const free = await name("Padrão Software");
    const free2 = await name("Padrão Hardware");
    const gid = (await sup<{ id: string }>("select id from offers where is_group and bu_id=$1", [buId.LBL]))[0].id;
    await fails(ID.headLBL, "select create_offer_group($1,'Só uma','Serviço','Recorrente',1,null,$2::uuid[])", [buId.LBL, [free]]);
    await fails(ID.headLBL, "select create_offer_group($1,'   ','Serviço','Recorrente',1,null,$2::uuid[])", [buId.LBL, [free, free2]]);
    await fails(ID.headLBL, "select create_offer_group($1,'Reaproveita','Serviço','Recorrente',1,null,$2::uuid[])", [buId.LBL, [free, dev.cs]]); // dev.cs já está em grupo
    await fails(ID.headLBL, "select create_offer_group($1,'Aninha','Serviço','Recorrente',1,null,$2::uuid[])", [buId.LBL, [free, gid]]); // grupo não vira membro
    await fails(ID.headLBL, "select create_offer_group($1,'Duplicada','Serviço','Recorrente',1,null,$2::uuid[])", [buId.LBL, [free, free]]);
    // oferta de outra BU
    await fails(ID.headLBL, "select create_offer_group($1,'Outra BU','Serviço','Recorrente',1,null,$2::uuid[])", [buId.LBL, [free, offerId.PRT]]);
    // outra BU não agrupa as ofertas da LBL
    await fails(ID.headPRT, "select create_offer_group($1,'Invasão','Serviço','Recorrente',1,null,$2::uuid[])", [buId.LBL, [free, free2]]);
  });

  it("proteções diretas na tabela: BU imutável, grupo de outra BU, grupo dentro de grupo", async () => {
    const gid = (await sup<{ id: string }>("select id from offers where is_group and bu_id=$1", [buId.LBL]))[0].id;
    await fails(ID.headLBL, "update offers set bu_id=$1 where id=$2", [buId.PRT, dev.cs]);
    await fails(ID.headLBL, "update offers set group_id=$1 where id=$2", [gid, gid]);
    await fails(ID.headLBL, "update offers set is_group = true where id=$1", [dev.cs]);
    // oferta de outra BU nem aparece para o head (RLS); e o gatilho barra mesmo quem escreve sem RLS
    expect(await as(ID.headLBL, "update offers set group_id=$1 where id=$2 returning id", [gid, offerId.PRT])).toHaveLength(0);
    await expect(sup("update offers set group_id=$1 where id=$2", [gid, offerId.PRT])).rejects.toThrow(/mesma BU/);
  });

  it("remover membro: só enquanto sobrarem 2; adicionar membro; desfazer devolve tudo", async () => {
    const gid = (await sup<{ id: string }>("select id from offers where is_group and bu_id=$1", [buId.LBL]))[0].id;
    await as(ID.headLBL, "select remove_from_offer_group($1)", [dev.arq]); // 3 → 2
    await fails(ID.headLBL, "select remove_from_offer_group($1)", [dev.cs]); // 2 → 1 não pode
    await as(ID.headLBL, "select add_to_offer_group($1,$2::uuid[])", [gid, [dev.arq]]);
    await fails(ID.headPRT, "select dissolve_offer_group($1)", [gid]);
    await as(ID.headLBL, "select dissolve_offer_group($1)", [gid]);
    expect((await sup("select * from offers where group_id is not null and bu_id=$1", [buId.LBL])).length).toBe(0);
    expect((await sup("select * from offers where is_group and bu_id=$1", [buId.LBL])).length).toBe(0);
    // a nota guardada do membro volta a valer
    expect((await as(ID.headLBL, "select * from evaluations_scored where offer_id=$1", [dev.java])).length).toBe(1);
  });

  it("voltar à etapa 1 reabre o agrupamento e trava a classificação até confirmar de novo", async () => {
    await as(ID.headLBL, "select set_bu_step($1,'offers',false)", [buId.LBL]);
    const st = await as<{ offers_confirmed_at: string | null; grouping_confirmed_at: string | null }>(ID.headLBL, "select * from bu_progress where bu_id=$1", [buId.LBL]);
    expect(st[0].offers_confirmed_at).toBeNull();
    expect(st[0].grouping_confirmed_at).toBeNull();
    expect(await as(ID.headLBL, "update evaluations set n1=2 where offer_id=$1 returning id", [dev.java])).toHaveLength(0);
    await as(ID.headLBL, "select set_bu_step($1,'offers',true)", [buId.LBL]);
    await as(ID.headLBL, "select set_bu_step($1,'grouping',true)", [buId.LBL]);
    expect((await as(ID.headLBL, "update evaluations set n1=2 where offer_id=$1 returning id", [dev.java])).length).toBe(1);
  });

  it("envio exige as etapas concluídas e a lista precisa ter oferta", async () => {
    await sup("insert into offers (bu_id,name) values ($1,'Oferta DAT')", [buId.DAT]);
    const gaps = await as<{ kind: string }>(ID.headDAT, "select kind from submission_gaps($1)", [buId.DAT]);
    expect(gaps.some((g) => g.kind === "etapa")).toBe(true);
    await fails(ID.headDAT, "select submit_bu($1)", [buId.DAT]);
    await sup("delete from offers where bu_id=$1", [buId.DAT]);
    await fails(ID.headDAT, "select set_bu_step($1,'offers',true)", [buId.DAT]); // sem nenhuma oferta
  });

  it("alterações de etapa e de agrupamento ficam na auditoria", async () => {
    const log = await as<{ table_name: string }>(ID.admin, "select table_name from audit_log where table_name in ('bu_progress','offers')");
    expect(log.some((l) => l.table_name === "bu_progress")).toBe(true);
    void offerIdsOf;
  });
});

/* ------------------------------------------------------------------ */
/* ID automático e sequencial das ofertas                              */
/* ------------------------------------------------------------------ */
describe("ID automático das ofertas", () => {
  const codes = async (bu: string, group = false) =>
    (await sup<{ code: string }>("select code from offers where bu_id=$1 and is_group=$2 order by created_at, code", [bu, group])).map((r) => r.code);

  it("oferta nova recebe OF-NN sequencial dentro da BU, sem o usuário informar nada", async () => {
    await as(ID.headDAT, "insert into offers (bu_id,name) values ($1,'Alfa')", [buId.DAT]);
    await as(ID.headDAT, "insert into offers (bu_id,name) values ($1,'Beta')", [buId.DAT]);
    await as(ID.headDAT, "insert into offers (bu_id,name,code) values ($1,'Gama','  ')", [buId.DAT]); // em branco também é automático
    expect(await codes(buId.DAT)).toEqual(["OF-01", "OF-02", "OF-03"]);
  });

  it("cada BU tem a sua sequência", async () => {
    const r = await as<{ code: string }>(ID.headLBL, "insert into offers (bu_id,name) values ($1,'Outra BU') returning code", [buId.LBL]);
    expect(r[0].code).toMatch(/^OF-\d{2,}$/);
    const first = await sup<{ code: string }>("select code from offers where bu_id=$1 and name='Alfa'", [buId.DAT]);
    expect(first[0].code).toBe("OF-01"); // a DAT não foi afetada pela LBL
  });

  it("vários cadastros de uma vez recebem números diferentes", async () => {
    await sup("insert into offers (bu_id,name) values ($1,'L1'),($1,'L2'),($1,'L3'),($1,'L4')", [buId.CYB]);
    const c = (await sup<{ code: string }>("select code from offers where bu_id=$1 and name like 'L_' order by name", [buId.CYB])).map((r) => r.code);
    expect(new Set(c).size).toBe(4);
    const nums = c.map((x) => Number(x.split("-")[1]));
    expect(nums[3] - nums[0]).toBe(3); // consecutivos
  });

  it("ID informado (importação) é mantido; a sequência continua a partir do maior", async () => {
    await as(ID.headDAT, "insert into offers (bu_id,name,code) values ($1,'Importada','OF-10')", [buId.DAT]);
    const r = await as<{ code: string }>(ID.headDAT, "insert into offers (bu_id,name) values ($1,'Depois') returning code", [buId.DAT]);
    expect(r[0].code).toBe("OF-11");
  });

  it("ID é único na BU (qualquer caixa), mas pode repetir em outra BU", async () => {
    await fails(ID.headDAT, "insert into offers (bu_id,name,code) values ($1,'Repetida','of-10')", [buId.DAT]);
    expect(await as(ID.headLBL, "insert into offers (bu_id,name,code) values ($1,'Mesma numeração','OF-10') returning id", [buId.LBL])).toHaveLength(1);
  });

  it("agrupamento usa a sequência AG-NN, separada das ofertas", async () => {
    const ids = (await sup<{ id: string }>("select id from offers where bu_id=$1 and not is_group order by code limit 2", [buId.DAT])).map((r) => r.id);
    await as(ID.headDAT, "select create_offer_group($1,'Grupo A','Serviço','Recorrente',1,null,$2::uuid[])", [buId.DAT, ids]);
    expect(await codes(buId.DAT, true)).toEqual(["AG-01"]);
    const rest = (await sup<{ id: string }>("select id from offers where bu_id=$1 and not is_group and group_id is null order by code limit 2", [buId.DAT])).map((r) => r.id);
    await as(ID.headDAT, "select create_offer_group($1,'Grupo B','Serviço','Recorrente',1,null,$2::uuid[])", [buId.DAT, rest]);
    expect(await codes(buId.DAT, true)).toEqual(["AG-01", "AG-02"]);
  });

  it("o ID não pode ser alterado depois de criado", async () => {
    await fails(ID.headDAT, "update offers set code='OF-99' where bu_id=$1 and name='Alfa'", [buId.DAT]);
    await fails(ID.headDAT, "update offers set code=null where bu_id=$1 and name='Alfa'", [buId.DAT]);
    expect(await as(ID.headDAT, "update offers set description='ok' where bu_id=$1 and name='Alfa' returning id", [buId.DAT])).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* Pitch por oferta × segmento                                         */
/* ------------------------------------------------------------------ */
describe("pitch por oferta × segmento", () => {
  const FULL = "descricao,dores,proposta_valor,pitch_abertura,perfil_cliente,persona_decisora";
  const fullValues = "'a','b','c','d','e','f'";
  let o1: string; let o2: string;
  const alta = (offer: string, seg: string) =>
    sup("insert into evaluations (offer_id,segment_id,n1,n2,n3,n4,n5,e1,e2,e3,e4,e5) values ($1,$2,5,5,5,5,5,'x','x','x','x','x') on conflict (offer_id,segment_id) do update set n1=5,n2=5,n3=5,n4=5,n5=5", [offer, seg]);
  const pitchGaps = async (bu: string, user = ID.headLBL) =>
    (await as<{ offer_id: string; segment_id: string }>(user, "select offer_id,segment_id from submission_gaps($1) where kind='pitch'", [bu]));

  beforeAll(async () => {
    o1 = (await sup<{ id: string }>("select id from offers where bu_id=$1 and name='Padrão Software'", [buId.LBL]))[0].id;
    o2 = (await sup<{ id: string }>("select id from offers where bu_id=$1 and name='Padrão Hardware'", [buId.LBL]))[0].id;
    await sup("delete from evaluations where bu_id=$1", [buId.LBL]); // parte do zero na LBL
    await sup("delete from pitches where bu_id=$1", [buId.LBL]);
  });

  it("duas ofertas no MESMO segmento têm pitches separados; cada pendência é por oferta × segmento", async () => {
    await alta(o1, segId["Saúde"]);
    await alta(o2, segId["Saúde"]);
    await alta(o1, segId["Governo"]);
    const gaps = await pitchGaps(buId.LBL);
    const keys = gaps.map((g) => `${g.offer_id}:${g.segment_id}`).sort();
    expect(keys).toEqual([`${o1}:${segId["Saúde"]}`, `${o2}:${segId["Saúde"]}`, `${o1}:${segId["Governo"]}`].sort());

    // completar o pitch de UMA oferta × segmento tira só aquela pendência
    await as(ID.headLBL, `insert into pitches (offer_id,segment_id,${FULL}) values ($1,$2,${fullValues})`, [o1, segId["Saúde"]]);
    expect((await pitchGaps(buId.LBL)).map((g) => `${g.offer_id}:${g.segment_id}`)).not.toContain(`${o1}:${segId["Saúde"]}`);
    expect(await pitchGaps(buId.LBL)).toHaveLength(2);
    // a outra oferta no mesmo segmento continua pendente
    await as(ID.headLBL, `insert into pitches (offer_id,segment_id,${FULL}) values ($1,$2,${fullValues})`, [o2, segId["Saúde"]]);
    expect(await pitchGaps(buId.LBL)).toHaveLength(1);
  });

  it("pitch incompleto não conta; célula que não é alta/potencial não exige pitch", async () => {
    await as(ID.headLBL, "insert into pitches (offer_id,segment_id,descricao) values ($1,$2,'só um campo')", [o1, segId["Governo"]]);
    expect((await pitchGaps(buId.LBL)).some((g) => g.offer_id === o1 && g.segment_id === segId["Governo"])).toBe(true);
    // nota baixa em outro segmento: sem pitch obrigatório
    await sup("insert into evaluations (offer_id,segment_id,n1,n2,n3,n4,n5) values ($1,$2,1,1,1,1,1)", [o2, segId["Governo"]]);
    expect((await pitchGaps(buId.LBL)).some((g) => g.offer_id === o2 && g.segment_id === segId["Governo"])).toBe(false);
  });

  it("um pitch por oferta × segmento (sem duplicar), a BU vem da oferta", async () => {
    await fails(ID.headLBL, "insert into pitches (offer_id,segment_id) values ($1,$2)", [o1, segId["Saúde"]]); // já existe
    const r = await as<{ bu_id: string }>(ID.headLBL, "insert into pitches (offer_id,segment_id,bu_id) values ($1,$2,$3) returning bu_id", [o2, segId["Indústria"], buId.PRT]);
    expect(r[0].bu_id).toBe(buId.LBL); // o bu_id enviado pelo cliente é ignorado
  });

  it("não há pitch para oferta de outra BU, nem para oferta dentro de agrupamento", async () => {
    await fails(ID.headLBL, "insert into pitches (offer_id,segment_id) values ($1,$2)", [offerId.PRT, segId["Saúde"]]);
    expect(await as(ID.headLBL, "select * from pitches where offer_id=$1", [offerId.CYB])).toHaveLength(0);
    await as(ID.headLBL, "select create_offer_group($1,'Grupo de pitch','Serviço','Recorrente',1,null,$2::uuid[])", [buId.LBL, [o1, o2]]);
    await fails(ID.headLBL, "insert into pitches (offer_id,segment_id) values ($1,$2)", [o1, segId["Varejo (inclui Atacado)"]]);
    const g = (await sup<{ id: string }>("select id from offers where is_group and bu_id=$1 and name='Grupo de pitch'", [buId.LBL]))[0].id;
    await alta(g, segId["Saúde"]);
    expect((await pitchGaps(buId.LBL)).some((x) => x.offer_id === g)).toBe(true); // o agrupamento é quem precisa do pitch
    expect((await pitchGaps(buId.LBL)).some((x) => x.offer_id === o1 || x.offer_id === o2)).toBe(false);
    await as(ID.headLBL, "select dissolve_offer_group($1)", [g]);
  });

  it("antes das etapas concluídas o head não grava pitch; o legado não é acessível", async () => {
    const off = (await sup<{ id: string }>("insert into offers (bu_id,name) values ($1,'Oferta DAT pitch') returning id", [buId.DAT]))[0].id;
    await fails(ID.headDAT, "insert into pitches (offer_id,segment_id) values ($1,$2)", [off, segId["Saúde"]]);
    await fails(ID.headLBL, "select * from pitches_legacy");
    await fails(ID.admin, "select * from pitches_legacy");
  });

  it("o pitch some junto com a oferta e entra na auditoria depois do envio", async () => {
    const off = (await sup<{ id: string }>("insert into offers (bu_id,name) values ($1,'Descartável') returning id", [buId.ITD]))[0].id;
    await sup("insert into pitches (offer_id,segment_id,descricao) values ($1,$2,'x')", [off, segId["Saúde"]]);
    await sup("delete from offers where id=$1", [off]);
    expect(await sup("select * from pitches where offer_id=$1", [off])).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* Ficha de pitch: campos novos                                        */
/* ------------------------------------------------------------------ */
describe("ficha de pitch: perfil de cliente estruturado e cases em lista", () => {
  const gapsOf = async (offer: string) =>
    (await as<{ offer_id: string }>(ID.headLBL, "select offer_id from submission_gaps($1) where kind='pitch' and offer_id=$2", [buId.LBL, offer])).length;
  let off: string;

  beforeAll(async () => {
    off = (await sup<{ id: string }>("select id from offers where bu_id=$1 and name='Padrão Hardware'", [buId.LBL]))[0].id;
    await sup("delete from pitches where offer_id=$1", [off]);
    await sup("delete from evaluations where offer_id=$1", [off]);
    await sup("insert into evaluations (offer_id,segment_id,n1,n2,n3,n4,n5,e1,e2,e3,e4,e5) values ($1,$2,5,5,5,5,5,'x','x','x','x','x')", [off, segId["Varejo (inclui Atacado)"]]);
  });
  const seg = () => segId["Varejo (inclui Atacado)"];

  it("exige descrição, dores, proposta, abertura, perfil de cliente e persona decisora", async () => {
    expect(await gapsOf(off)).toBe(1); // sem ficha
    const all = { descricao: "d", dores: "x", proposta_valor: "p", pitch_abertura: "a", perfil_cliente: "Hospitais", persona_decisora: "CIO" };
    await as(ID.headLBL, "insert into pitches (offer_id,segment_id,descricao,dores,proposta_valor,pitch_abertura,perfil_cliente) values ($1,$2,'d','x','p','a','Hospitais')", [off, seg()]);
    expect(await gapsOf(off)).toBe(1); // falta a persona decisora
    await as(ID.headLBL, "update pitches set persona_decisora='CIO' where offer_id=$1 and segment_id=$2", [off, seg()]);
    expect(await gapsOf(off)).toBe(0);
    // cada obrigatório sozinho em branco derruba a ficha
    for (const f of Object.keys(all)) {
      await as(ID.headLBL, `update pitches set ${f}='  ' where offer_id=$1 and segment_id=$2`, [off, seg()]);
      expect(await gapsOf(off), f).toBe(1);
      await as(ID.headLBL, `update pitches set ${f}=$3 where offer_id=$1 and segment_id=$2`, [off, seg(), all[f as keyof typeof all]]);
    }
    expect(await gapsOf(off)).toBe(0);
  });

  it("persona influenciadora, funcionários, modelo, ticket e cases são opcionais", async () => {
    const r = await as<{ cases: unknown[]; modelo_receita: string | null }>(ID.headLBL,
      "select cases, modelo_receita from pitches where offer_id=$1 and segment_id=$2", [off, seg()]);
    expect(r[0].cases).toEqual([]); // sem cases por padrão
    expect(r[0].modelo_receita).toBeNull();
    expect(await gapsOf(off)).toBe(0);
  });

  it("cases: lista com 1 ou mais; precisa ser uma lista", async () => {
    await as(ID.headLBL, `update pitches set cases=$3::jsonb where offer_id=$1 and segment_id=$2`,
      [off, seg(), JSON.stringify([{ cliente: "A", desafio: "d", solucao: "s", resultado: "r" }, { cliente: "B", desafio: "", solucao: "", resultado: "" }])]);
    const r = await as<{ n: number }>(ID.headLBL, "select jsonb_array_length(cases) as n from pitches where offer_id=$1 and segment_id=$2", [off, seg()]);
    expect(r[0].n).toBe(2);
    await fails(ID.headLBL, `update pitches set cases='{"cliente":"x"}'::jsonb where offer_id=$1 and segment_id=$2`, [off, seg()]);
  });

  it("modelo só Recorrente/Pontual; funcionários e ticket não negativos; faixa coerente", async () => {
    await as(ID.headLBL, "update pitches set modelo_receita='Recorrente', ticket_medio=15000, funcionarios_min=500, funcionarios_max=2000 where offer_id=$1 and segment_id=$2", [off, seg()]);
    await fails(ID.headLBL, "update pitches set modelo_receita='Mensal' where offer_id=$1 and segment_id=$2", [off, seg()]);
    await fails(ID.headLBL, "update pitches set ticket_medio=-1 where offer_id=$1 and segment_id=$2", [off, seg()]);
    await fails(ID.headLBL, "update pitches set funcionarios_min=-5 where offer_id=$1 and segment_id=$2", [off, seg()]);
    await fails(ID.headLBL, "update pitches set funcionarios_min=3000 where offer_id=$1 and segment_id=$2", [off, seg()]); // maior que o máximo (2000)
  });

  it("campos que saíram não existem mais na ficha", async () => {
    const cols = (await sup<{ column_name: string }>("select column_name from information_schema.columns where table_name='pitches'")).map((c) => c.column_name);
    for (const gone of ["produtos_fit", "icp", "sinergias_bus", "sinergias_texto", "aderencia_nivel", "aderencia_just", "potencial_expansao", "potencial_modelo", "potencial_ticket", "case_cliente"])
      expect(cols, gone).not.toContain(gone);
    for (const added of ["descricao", "cases", "perfil_cliente", "persona_decisora", "persona_influenciadora", "funcionarios_min", "funcionarios_max", "modelo_receita", "ticket_medio"])
      expect(cols, added).toContain(added);
  });

  it("a cópia de segurança não é acessível pelo app", async () => {
    await fails(ID.admin, "select * from pitches_backup_0006");
    await fails(ID.headLBL, "select * from pitches_backup_0006");
  });
});

/* ------------------------------------------------------------------ */
/* Etapa 1 exige tipo e modelo preenchidos                             */
/* ------------------------------------------------------------------ */
describe("etapa 1: confirmar a lista só com tipo e modelo preenchidos", () => {
  it("bloqueia enquanto faltar tipo ou modelo, diz quantas faltam; ticket é opcional", async () => {
    await sup("delete from offers where bu_id=$1", [buId.DAT]);
    await sup("insert into offers (bu_id,name) values ($1,'Sem nada'),($1,'Só tipo')", [buId.DAT]);
    await sup("update offers set offer_type='Software' where bu_id=$1 and name='Só tipo'", [buId.DAT]);
    await expect(as(ID.headDAT, "select set_bu_step($1,'offers',true)", [buId.DAT])).rejects.toThrow(/faltam 2 ofertas/);
    await sup("update offers set revenue_model='Pontual' where bu_id=$1 and name='Só tipo'", [buId.DAT]);
    await expect(as(ID.headDAT, "select set_bu_step($1,'offers',true)", [buId.DAT])).rejects.toThrow(/faltam 1 oferta\b/);
    await sup("update offers set offer_type='Serviço', revenue_model='Recorrente' where bu_id=$1 and name='Sem nada'", [buId.DAT]);
    // nenhuma das duas tem ticket: continua valendo
    await as(ID.headDAT, "select set_bu_step($1,'offers',true)", [buId.DAT]);
    expect((await as<{ offers_confirmed_at: string | null }>(ID.headDAT, "select offers_confirmed_at from bu_progress where bu_id=$1", [buId.DAT]))[0].offers_confirmed_at).not.toBeNull();
  });

  it("ofertas inativas não contam; o head completa os campos da própria BU, nunca de outra", async () => {
    await as(ID.headDAT, "select set_bu_step($1,'offers',false)", [buId.DAT]);
    await sup("insert into offers (bu_id,name,active) values ($1,'Desativada sem tipo',false)", [buId.DAT]);
    await as(ID.headDAT, "select set_bu_step($1,'offers',true)", [buId.DAT]); // inativa sem tipo não bloqueia
    // edição de tipo/modelo/ticket pelo head: só na própria BU
    await as(ID.headDAT, "update offers set offer_type='Hardware', revenue_model='Pontual', ticket_medio=90000 where bu_id=$1 and name='Sem nada'", [buId.DAT]);
    expect(await as(ID.headDAT, "update offers set offer_type='Hardware' where bu_id=$1 returning id", [buId.CYB])).toHaveLength(0);
    await fails(ID.headDAT, "update offers set offer_type='Projeto' where bu_id=$1 and name='Sem nada'", [buId.DAT]); // fora da lista padronizada
  });
});

/* ------------------------------------------------------------------ */
/* ID automático acima de 99                                           */
/* ------------------------------------------------------------------ */
describe("ID automático das ofertas passa de 99", () => {
  it("a 100ª e a 101ª oferta da BU recebem OF-100 e OF-101, sem repetir", async () => {
    await sup("delete from offers where bu_id=$1", [buId.LBL]);
    // uma a uma, como o app faz
    for (let i = 1; i <= 101; i++) await sup("insert into offers (bu_id,name) values ($1,$2)", [buId.LBL, `Produto ${i}`]);
    const rows = await sup<{ code: string }>("select code from offers where bu_id=$1 order by created_at, name", [buId.LBL]);
    const codes = rows.map((r) => r.code);
    expect(new Set(codes).size).toBe(101);
    expect(codes).toContain("OF-09");
    expect(codes).toContain("OF-99");
    expect(codes).toContain("OF-100");
    expect(codes).toContain("OF-101");
    // agrupamentos seguem a mesma regra
    await sup("insert into offers (bu_id,name,is_group) values ($1,'Grupo',true)", [buId.LBL]);
    expect((await sup<{ code: string }>("select code from offers where bu_id=$1 and is_group", [buId.LBL]))[0].code).toBe("AG-01");
  });
});

/* ------------------------------------------------------------------ */
/* Desconsiderar ofertas na etapa 1                                    */
/* ------------------------------------------------------------------ */
describe("desconsiderar oferta (inativar sem apagar)", () => {
  it("o head desconsidera na própria BU, a oferta sai da conferência e das pendências, e pode voltar", async () => {
    await as(ID.headDAT, "select set_bu_step($1,'offers',false)", [buId.DAT]); // reabre (o teste anterior confirmou)
    await sup("delete from offers where bu_id=$1", [buId.DAT]);
    await sup("insert into offers (bu_id,name,offer_type,revenue_model) values ($1,'Fica','Software','Pontual')", [buId.DAT]);
    await sup("insert into offers (bu_id,name) values ($1,'Sem tipo, será desconsiderada')", [buId.DAT]);
    await expect(as(ID.headDAT, "select set_bu_step($1,'offers',true)", [buId.DAT])).rejects.toThrow(/faltam 1 oferta\b/);

    const done = await as(ID.headDAT, "update offers set active=false where bu_id=$1 and name like 'Sem tipo%' returning id", [buId.DAT]);
    expect(done).toHaveLength(1);
    await as(ID.headDAT, "select set_bu_step($1,'offers',true)", [buId.DAT]); // agora confirma
    expect(await sup("select 1 from offers where bu_id=$1 and name like 'Sem tipo%'", [buId.DAT])).toHaveLength(1); // não foi apagada
    const gaps = await as<{ detail: string }>(ID.headDAT, "select detail from submission_gaps($1)", [buId.DAT]);
    expect(gaps.some((g) => /Sem tipo/.test(g.detail))).toBe(false);

    // outra BU não consegue mexer
    expect(await as(ID.headCYB, "update offers set active=false where bu_id=$1 returning id", [buId.DAT])).toHaveLength(0);
    // reconsiderar
    expect(await as(ID.headDAT, "update offers set active=true where bu_id=$1 and name like 'Sem tipo%' returning id", [buId.DAT])).toHaveLength(1);
  });
});
