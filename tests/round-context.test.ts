import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { vi } from "vitest";

vi.mock("@/app/actions/rounds", () => ({
  createActionItem: vi.fn(), deleteActionItem: vi.fn(), updateActionItem: vi.fn(), copyLeaderDraft: vi.fn(),
  saveActionItem: vi.fn(), saveRoundNotes: vi.fn(), setPitchValidated: vi.fn(), setRoundPriority: vi.fn(), setRoundPriorityNote: vi.fn(),
}));
vi.mock("@/app/actions/segment", () => ({ saveLeaderPitch: vi.fn() }));
vi.mock("@/app/actions/bu", () => ({ savePitch: vi.fn() }));
vi.mock("next/link", () => ({ default: (p: { href: string; children?: unknown }) => h("a", { href: p.href }, p.children as never) }));

import { RoundDeck, type RoundDeckProps } from "../src/components/RoundDeck";
import { buildRoundSlides } from "../src/lib/rounds";
import { orderBlocks, parseBody, toBlock, type ContextBlock } from "../src/lib/round-context";

describe("blocos de contexto: validação do conteúdo", () => {
  it("cartões: exige rótulo e valor, limpa textos e ignora tom inválido", () => {
    const r = parseBody("cards", { cards: [{ label: "  Mercado  ", value: "US$ 6,2 tri", caption: "2026", tone: "ok" }, { label: "B", value: 12, tone: "roxo" }] });
    expect(r).toEqual({ ok: true, body: { cards: [{ label: "Mercado", value: "US$ 6,2 tri", caption: "2026", tone: "ok" }, { label: "B", value: "12" }] } });
    expect(parseBody("cards", { cards: [] }).ok).toBe(false);
    expect(parseBody("cards", { cards: [{ label: "sem valor" }] }).ok).toBe(false);
    expect(parseBody("cards", { cards: Array.from({ length: 13 }, () => ({ label: "a", value: "1" })) }).ok).toBe(false);
  });
  it("tabela: toda linha precisa ter o número de colunas; células aceitam tom", () => {
    const ok = parseBody("table", { columns: ["BU", "Conv."], align: ["l", "r"], rows: [["Print", { v: "28%", t: "ok" }], ["Cyber", "16%"]] });
    expect(ok).toEqual({ ok: true, body: { columns: ["BU", "Conv."], align: ["l", "r"], rows: [["Print", { v: "28%", t: "ok" }], ["Cyber", "16%"]] } });
    expect(parseBody("table", { columns: ["A", "B"], rows: [["só uma"]] }).ok).toBe(false);
    expect(parseBody("table", { columns: [], rows: [["x"]] }).ok).toBe(false);
    expect(parseBody("table", { columns: ["A"], rows: [] }).ok).toBe(false);
    expect(parseBody("table", { columns: ["A"], rows: "x" }).ok).toBe(false);
  });
  it("lista e texto", () => {
    expect(parseBody("list", { items: ["um", { title: "Dois", text: "texto" }] })).toEqual({ ok: true, body: { items: [{ text: "um" }, { title: "Dois", text: "texto" }] } });
    expect(parseBody("list", { items: [{ title: "sem texto" }] }).ok).toBe(false);
    expect(parseBody("text", { paragraphs: ["a", "  ", "b"] })).toEqual({ ok: true, body: { paragraphs: ["a", "b"] } });
    expect(parseBody("text", { paragraphs: ["  "] }).ok).toBe(false);
  });
  it("rejeita o que não é objeto e limita o tamanho dos textos", () => {
    for (const v of [null, "texto", [1, 2], 5]) expect(parseBody("text", v).ok).toBe(false);
    const r = parseBody("text", { paragraphs: ["x".repeat(5000)] });
    expect(r.ok && "paragraphs" in r.body ? r.body.paragraphs[0].length : 0).toBe(1500);
  });
  it("linha do banco inválida é descartada em vez de quebrar a tela", () => {
    const row = { id: "b1", round_id: "r1", segment_id: null, position: 1, kind: "table", title: "T", subtitle: null, source: null, note: null };
    expect(toBlock({ ...row, body: { columns: ["A"], rows: [["x"]] } })?.id).toBe("b1");
    expect(toBlock({ ...row, body: { columns: ["A"], rows: [["x", "y"]] } })).toBeNull();
    expect(toBlock({ ...row, kind: "grafico", body: {} })).toBeNull();
  });
  it("ordem: posição; em empate, o geral vem antes do do segmento", () => {
    const b = (id: string, position: number, segmentId: string | null, title = id): ContextBlock => ({ id, roundId: "r", segmentId, position, kind: "text", title, subtitle: null, body: { paragraphs: ["x"] }, source: null, note: null });
    expect(orderBlocks([b("c", 2, null), b("b", 1, "s1"), b("a", 1, null)]).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("blocos de contexto nas telas da rodada", () => {
  const rows = [{ offerId: "a", name: "A", score: 90, level: "foco" as const }];
  it("os blocos entram depois do contexto de texto e antes das regiões, na ordem recebida", () => {
    const s = buildRoundSlides(rows, { hasContext: true, hasRegional: true, blocks: [{ id: "b1", title: "Mercado" }, { id: "b2", title: "Funil" }] });
    expect(s.map((x) => x.key)).toEqual(["abertura", "contexto", "bloco:b1", "bloco:b2", "regioes", "mesa", "oferta:a", "plano", "resumo"]);
  });
  it("sem blocos nada muda", () => {
    expect(buildRoundSlides(rows, { hasContext: false, hasRegional: false }).map((x) => x.key)).toEqual(["abertura", "mesa", "oferta:a", "plano", "resumo"]);
  });

  const block = (over: Partial<ContextBlock> & Pick<ContextBlock, "id" | "kind" | "title" | "body">): ContextBlock => ({ roundId: "r1", segmentId: null, position: 0, subtitle: null, source: null, note: null, ...over });
  const BASE: RoundDeckProps = {
    segmentId: "seg-1", segmentName: "Saúde", leader: "Luiz", final: false, canEdit: true,
    round: { id: "r1", position: 1, name: "Hardware", context: null, focoLimit: 5, buCodes: ["ITD", "LBL", "PRT"], buOptions: [] },
    roundCount: 4, prevRoundId: null, nextRoundId: null, rows: [], items: [], regional: [], notes: "", hasDraft: false,
    blocks: [
      block({ id: "c", kind: "cards", title: "O mercado em números", subtitle: "Global e América Latina", source: "Omdia, Canalys 2026", note: "Dados globais", body: { cards: [{ label: "Tecnologia B2B", value: "US$ 6,2 tri", caption: "+12,6% em 2026", tone: "ok" }] } }),
      block({ id: "t", kind: "table", title: "Funil das BUs do grupo", body: { columns: ["BU", "Conversão 2026"], align: ["l", "r"], rows: [["Print Solutions", { v: "28,3%", t: "ok" }], ["IT Devices", { v: "11,5%", t: "bad" }]] } }),
      block({ id: "l", kind: "list", title: "Perguntas para a rodada", body: { items: [{ title: "Locação", text: "Qual oferta de locação vira Foco?" }, { text: "Como proteger a base de MPS?" }] } }),
      block({ id: "x", kind: "text", title: "Leitura", body: { paragraphs: ["Faturamento concentrado em Print."] } }),
    ],
  };
  const render = (key: string, over: Partial<RoundDeckProps> = {}) => renderToString(h(RoundDeck, { ...BASE, ...over, initialKey: key })).replaceAll("<!-- -->", "");

  it("cartões: valor, rótulo, legenda, ressalva e fonte", () => {
    const html = render("bloco:c");
    for (const t of ["O mercado em números", "Global e América Latina", "US$ 6,2 tri", "Tecnologia B2B", "+12,6% em 2026", "Ressalva:", "Dados globais", "Fonte: Omdia, Canalys 2026"]) expect(html).toContain(t);
  });
  it("tabela: cabeçalho, células e tom de destaque", () => {
    const html = render("bloco:t");
    for (const t of ["Funil das BUs do grupo", "Conversão 2026", "Print Solutions", "28,3%", "11,5%"]) expect(html).toContain(t);
    expect(html).toContain("text-red-800");
    expect(html).toContain("text-right");
  });
  it("lista e texto", () => {
    const l = render("bloco:l");
    for (const t of ["Perguntas para a rodada", "Locação", "Qual oferta de locação vira Foco?", "Como proteger a base de MPS?"]) expect(l).toContain(t);
    expect(render("bloco:x")).toContain("Faturamento concentrado em Print.");
  });
  it("bloco que não existe (de outro segmento ou removido) cai na mesa de decisão", () => {
    const html = render("bloco:inexistente");
    expect(html).toContain("Mesa de decisão");
  });
  it("sem fonte nem ressalva, o rodapé não aparece", () => {
    const html = render("bloco:t");
    expect(html).not.toContain("Fonte:");
    expect(html).not.toContain("Ressalva:");
  });
});
