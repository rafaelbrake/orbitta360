import { describe, expect, it } from "vitest";
import { summarizeSegments, type SegmentOverviewInput } from "../src/lib/segment-overview";
import type { EvaluationScored, Offer, Segment } from "../src/lib/types";

const seg = (id: string, name: string): Segment => ({ id, name, wave: "Onda 1", leader: null, active: true, sort: 1 });
const offer = (id: string, active = true, group_id: string | null = null): Offer => ({ id, bu_id: "b1", code: null, name: id, description: null, offer_type: null, revenue_model: null, ticket_medio: null, bcg: null, active, is_group: false, group_id });
// nota 3 não exige evidência: com ela a avaliação conta como completa
const ev = (offer_id: string, segment_id: string, complete = true, score: number | null = 90): EvaluationScored => ({
  id: `${offer_id}:${segment_id}`, offer_id, segment_id, bu_id: "b1", not_applicable: false,
  n1: complete ? 3 : null, n2: 3, n3: 3, n4: 3, n5: 3, e1: null, e2: null, e3: null, e4: null, e5: null, updated_at: "", score, class_code: "alta", specialist_led: false,
});

const S = [seg("s1", "Saúde"), seg("s2", "Varejo")];
const base = (): SegmentOverviewInput => ({
  segments: S, offers: [offer("a"), offer("b"), offer("c", false), offer("d", true, "grupo")],
  evals: [ev("a", "s1"), ev("b", "s1", false, null), ev("a", "s2")],
  priorities: [
    { segment_id: "s1", offer_id: "a", level: "foco", review_note: "trocar case", review_done: false },
    { segment_id: "s1", offer_id: "b", level: "apoio", review_note: "ok", review_done: true },
  ],
  strategies: [{ segment_id: "s1", thesis: "Foco em SOC", message: "  ", foco_limit: 3, status: "draft", finalized_at: null }],
  views: [{ segment_id: "s1", works: "x", not_works: null }, { segment_id: "s1", works: "  ", not_works: "" }, { segment_id: "s2", works: null, not_works: "y" }],
  mmt: [{ segment_id: "s1" }, { segment_id: "s1" }, { segment_id: "s2" }], leaderPitches: [{ segment_id: "s1" }],
});

describe("acompanhamento dos segmentos pela Diretoria", () => {
  it("conta avaliações dos heads (só ofertas ativas e fora de agrupamento) e o que o líder já decidiu", () => {
    const [s1] = summarizeSegments(base());
    expect(s1.evals).toEqual({ total: 2, done: 1 }); // a e b são classificáveis; só a está completa
    expect(s1.levels).toMatchObject({ foco: 1, apoio: 1, fora: 0 });
    expect(s1.focoLimit).toBe(3);
    expect(s1.thesis).toBe(true);
    expect(s1.message).toBe(false); // só espaços
    expect(s1.status).toBe("draft");
    expect(s1.pendingAdjustments).toBe(1); // o de b já foi feito
    expect(s1.regionalViews).toBe(1);      // a visão só com espaços não conta
    expect(s1.highlights).toBe(2);
    expect(s1.leaderPitches).toBe(1);
  });

  it("segmento sem nada do líder usa o limite padrão, rascunho e zeros", () => {
    const [, s2] = summarizeSegments(base());
    expect(s2).toMatchObject({ focoLimit: 5, thesis: false, message: false, status: "draft", pendingAdjustments: 0, regionalViews: 1, highlights: 1, leaderPitches: 0 });
    expect(s2.levels).toMatchObject({ foco: 0, apoio: 0, fora: 0 });
  });

  it("versão final aparece com a data", () => {
    const i = base();
    i.strategies = [{ segment_id: "s2", thesis: "x", message: "y", foco_limit: 5, status: "final", finalized_at: "2026-11-26T15:00:00Z" }];
    const [, s2] = summarizeSegments(i);
    expect(s2.status).toBe("final");
    expect(s2.finalizedAt).toBe("2026-11-26T15:00:00Z");
  });
});
