import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: (p: { href: string; children?: unknown }) => h("a", { href: p.href }, p.children as never) }));

import { SegmentOverviewTable } from "../src/components/SegmentOverviewTable";
import type { SegmentOverview } from "../src/lib/segment-overview";

const row = (o: Partial<SegmentOverview> & { id: string; name: string }): SegmentOverview => ({
  segment: { id: o.id, name: o.name, wave: "Onda 1", leader: "Luiz Gustavo Duarte", active: true, sort: 1 },
  evals: { done: 30, total: 60 }, levels: { foco: 3, apoio: 4, fora: 2, semNivel: 1 }, focoLimit: 5, thesis: true, message: false, status: "draft", finalizedAt: null,
  pendingAdjustments: 2, regionalViews: 3, highlights: 4, leaderPitches: 1, ...o,
});
const render = (rows: SegmentOverview[]) => renderToString(h(SegmentOverviewTable, { rows })).replaceAll("<!-- -->", "");

describe("tabela de acompanhamento dos segmentos", () => {
  it("mostra líder, andamento, níveis, estratégia, regionais, ajustes e status, com link para abrir e para a reunião", () => {
    const html = render([row({ id: "s1", name: "Saúde" })]);
    for (const t of ["Saúde", "Luiz Gustavo Duarte", "30 de 60", "Foco 3/5", "Apoio 4 · Fora 2 · sem nível 1", "Tese", "Mensagem", "3 visões", "4 destaques · 1 pitches do líder", "2 pendentes", "Rascunho"]) expect(html).toContain(t);
    expect(html).toContain('href="/segmento/s1"');
    expect(html).toContain('href="/reuniao/s1"');
  });

  it("segmento sem líder e com Foco acima do limite é destacado; versão final mostra a data", () => {
    const html = render([row({ id: "s2", name: "Varejo", segment: { id: "s2", name: "Varejo", wave: "Onda 2", leader: null, active: true, sort: 2 }, levels: { foco: 6, apoio: 0, fora: 0, semNivel: 0 }, pendingAdjustments: 0, status: "final", finalizedAt: "2026-11-26T15:00:00Z" })]);
    expect(html).toContain("sem líder");
    expect(html).toContain("text-(--danger)\">Foco 6/5");
    expect(html).toContain("Versão final");
    expect(html).toContain("26/11/2026");
  });
});
