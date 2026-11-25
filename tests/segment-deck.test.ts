import { createElement } from "react";
import { renderToString } from "react-dom/server";
import JSZip from "jszip";
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { PitchData } from "../src/lib/book";
import type { ActionItem } from "../src/lib/rounds";
import { PAGE, buildSegmentDeck, columnHeight, columnWidth, planRowHeight, summarize, tidy, type Slide } from "../src/lib/segment-deck";
import type { PlanOffer, SegmentPlan } from "../src/lib/segment-plan";
import { renderPptx } from "../src/lib/segment-pptx";
import { THESIS_MODEL, THESIS_PROMPT, THESIS_SCHEMA, ThesisError, generateThesis, thesisMessage, type ThesisClient } from "../src/lib/thesis-generator";

vi.mock("@/app/actions/segment", () => ({ saveStrategy: vi.fn() }));
import { SegmentThesisPanel } from "../src/components/SegmentThesisPanel";

const long = (n: number) => "Processos manuais atrasam o atendimento e geram retrabalho na ponta. ".repeat(Math.ceil(n / 70)).slice(0, n);
const pitch = (size = 300): PitchData => ({
  descricao: "d", dores: `• ${long(size)}\n• Falta de visibilidade`, proposta_valor: long(size), pitch_abertura: long(size),
  pergunta_1: "Quem decide isso hoje?", pergunta_2: "Quanto tempo leva?", pergunta_3: null,
  cases: [{ cliente: "Hospital Sigiloso", desafio: "d", solucao: "s", resultado: "r" }],
  perfil_cliente: null, persona_decisora: null, persona_influenciadora: null, funcionarios_min: null, funcionarios_max: null, modelo_receita: null, ticket_medio: null,
});
const offer = (n: number, size?: number): PlanOffer => ({ offerId: `o${n}`, name: `Oferta ${n}`, buCode: "ITS", score: 87, note: null, pitch: pitch(size) });
const item = (n: number, over: Partial<ActionItem> = {}): ActionItem => ({
  recordId: `a${n}`, custom: false, type: "mudar", regional: "Sul", buCode: "ITS", offerName: null, headline: `Ação número ${n}`, evidence: null,
  action: long(200), indicator: null, audience: null, priority: null, decision: "validado", owner: "Fulana Responsável", due: "2027-01-31", note: "", ...over,
});
const plan = (over: Partial<SegmentPlan> = {}): SegmentPlan => ({
  segmentName: "Saúde", leader: "Líder Teste", thesis: "Focar em dados.", message: "Abrir pela dor.", final: false,
  rounds: [1, 2, 3, 4].map((p) => ({
    id: `r${p}`, position: p, name: `Grupo ${p}`, buCodes: ["ITS", "CYB"], foco: [1, 2, 3, 4, 5].map((i) => offer(p * 10 + i)), apoio: ["Apoiada"], fora: ["Descartada"],
    items: [item(p * 10 + 1), item(p * 10 + 2, { custom: true, owner: "", due: "" })],
  })),
  regional: [{ regional: "Sul", works: "Visita técnica", not_works: "Proposta genérica" }],
  ...over,
});
const now = new Date("2026-11-25T15:00:00Z");
const kinds = (s: Slide[]) => s.map((x) => x.kind);

function checkFits(slides: Slide[]) {
  for (const s of slides) {
    if (s.kind === "texto") for (const c of s.columns) expect(columnHeight(c.blocks, columnWidth(s.columns.length), c.size)).toBeLessThanOrEqual(PAGE.bottom - PAGE.top);
    if (s.kind === "plano") expect(s.rows.reduce((h, r) => h + planRowHeight(r), 0.45)).toBeLessThanOrEqual(PAGE.bottom - PAGE.top);
  }
}

describe("roteiro da apresentação", () => {
  it("segue a ordem: capa, tese, resumo, rodadas, plano e anexo", () => {
    const slides = buildSegmentDeck(plan(), now);
    expect(kinds(slides).slice(0, 8)).toEqual(["capa", "texto", "resumo", "rodada", "rodada", "rodada", "rodada", "plano"]);
    expect(slides[0]).toMatchObject({ segment: "Saúde", leader: "Líder Teste", date: "25 de novembro de 2026" });
    expect(slides.filter((s) => s.kind === "texto" && s.title.startsWith("Oferta "))).toHaveLength(20);
    expect(slides.filter((s) => s.kind === "plano").flatMap((s) => (s.kind === "plano" ? s.rows : []))).toHaveLength(8);
    checkFits(slides);
  });
  it("não leva a nota do pitch nem os cases", () => {
    const all = JSON.stringify(buildSegmentDeck(plan(), now));
    expect(all).not.toContain("Hospital Sigiloso");
    expect(all).not.toContain("87");
  });
  it("pula a tese vazia e as rodadas sem Foco", () => {
    const base = plan();
    const slides = buildSegmentDeck({ ...base, thesis: " ", message: "", rounds: base.rounds.map((r) => ({ ...r, foco: [], items: [] })) }, now);
    expect(kinds(slides)).toEqual(["capa", "resumo"]);
    expect(JSON.stringify(slides)).toContain("Nenhuma oferta em Foco");
  });
  it("divide textos longos em mais slides em vez de cortar", () => {
    const base = plan({ thesis: long(3900), message: long(3900) });
    base.rounds[0].foco = [offer(99, 2200)];
    base.rounds[0].items = Array.from({ length: 30 }, (_, i) => item(i, { note: long(150) }));
    const slides = buildSegmentDeck(base, now);
    expect(slides.filter((s) => "title" in s && s.title.startsWith("Tese do segmento"))).toHaveLength(2);
    const annex = slides.filter((s) => s.kind === "texto" && s.title.startsWith("Oferta 99"));
    expect(annex).toHaveLength(2);
    expect(JSON.stringify(annex)).toContain(long(2200).trim().slice(-60));
    expect(slides.filter((s) => s.kind === "plano").length).toBeGreaterThan(2);
    checkFits(slides);
  });
  it("limpa marcação e resume tópicos em uma frase", () => {
    expect(tidy("## Título\n\n**forte**  aqui")).toBe("Título\nforte aqui");
    expect(summarize("• Primeira\n- Segunda.\n3) Terceira")).toBe("Primeira; Segunda. Terceira");
    expect(summarize(long(600)).length).toBeLessThanOrEqual(200);
    expect(summarize(long(600)).endsWith("…")).toBe(true);
    expect(summarize("")).toBe("—");
  });
});

describe("arquivo PPT", () => {
  it("gera um .pptx com os slides do roteiro e o logo", async () => {
    const slides = buildSegmentDeck(plan(), now);
    const zip = await JSZip.loadAsync(await renderPptx(slides, "Teste"));
    const files = Object.keys(zip.files);
    expect(files.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))).toHaveLength(slides.length);
    expect(files.some((f) => f.startsWith("ppt/media/") && f.endsWith(".png"))).toBe(true);
    const xml = (await Promise.all(files.filter((f) => f.startsWith("ppt/slides/slide")).map((f) => zip.file(f)!.async("string")))).join("");
    for (const t of ["Segmento Saúde", "Tese do segmento", "Rodada 4 · Grupo 4", "Plano de ação", "Ação número 41", "Fulana Responsável", "31/01/2027", "uso interno"]) expect(xml).toContain(t);
    expect(xml).not.toContain("Hospital Sigiloso");
  });
});

type Message = { stop_reason: string; content: { type: string; text?: string }[] };
const answer = { tese: "Focar.", mensagem: "Abrir pela dor.", pontos: ["a", "b", "c", "d", "e", "f"] };
const message = (over: Partial<Message> = {}): Message => ({ stop_reason: "end_turn", content: [{ type: "thinking" }, { type: "text", text: JSON.stringify(answer) }], ...over });
function fake(result: Message | Error) {
  const stream = vi.fn(() => ({ finalMessage: async () => { if (result instanceof Error) throw result; return result; } }));
  return { stream, client: { beta: { messages: { stream } } } as unknown as ThesisClient };
}

describe("tese com IA", () => {
  it("manda o que as rodadas produziram, sem cases, responsáveis nem o nome do líder", () => {
    const m = thesisMessage(plan());
    for (const t of ["Segmento: Saúde", "Rodada 4: Grupo 4", "Oferta 41", "Fora do foco: Descartada", "Ação número 12", "responsável: não definido", "Visita técnica"]) expect(m).toContain(t);
    for (const t of ["Hospital Sigiloso", "Fulana Responsável", "Líder Teste"]) expect(m).not.toContain(t);
    expect(THESIS_PROMPT).toContain("Não invente");
  });
  it("pede saída estruturada e devolve o rascunho com até cinco pontos", async () => {
    const { stream, client } = fake(message());
    await expect(generateThesis(plan(), client)).resolves.toEqual({ thesis: "Focar.", message: "Abrir pela dor.", points: ["a", "b", "c", "d", "e"] });
    const params = (stream.mock.calls as unknown as [Record<string, unknown>][])[0][0];
    expect(params.model).toBe(THESIS_MODEL);
    expect(params.output_config).toEqual({ effort: "medium", format: { type: "json_schema", schema: THESIS_SCHEMA } });
  });
  it("explica as falhas em português", async () => {
    await expect(generateThesis(plan(), fake(message({ stop_reason: "refusal" })).client)).rejects.toThrow(ThesisError);
    await expect(generateThesis(plan(), fake(message({ content: [{ type: "text", text: "{" }] })).client)).rejects.toThrow("formato inesperado");
    await expect(generateThesis(plan(), fake(message({ content: [{ type: "text", text: '{"tese":"","mensagem":"x","pontos":[]}' }] })).client)).rejects.toThrow("incompleta");
    await expect(generateThesis(plan(), fake(new Anthropic.APIConnectionError({ message: "x" })).client)).rejects.toThrow("demorou demais");
  });
});

describe("painel de tese e apresentação", () => {
  const html = (over: Partial<Parameters<typeof SegmentThesisPanel>[0]> = {}) =>
    renderToString(createElement(SegmentThesisPanel, { segmentId: "seg", initial: { thesis: "Minha tese", message: "" }, readOnly: false, canGenerate: true, focoCount: 3, ...over }));

  it("mostra gerar, salvar e baixar", () => {
    const h = html();
    for (const t of ["Gerar tese com IA", "Salvar tese", "Baixar apresentação (PPT)", "Minha tese", 'href="/segmento/seg/rodadas/pptx"']) expect(h).toContain(t);
  });
  it("sem chave não oferece a IA; travado só baixa", () => {
    expect(html({ canGenerate: false })).not.toContain("Gerar tese com IA");
    const locked = html({ readOnly: true });
    expect(locked).not.toContain("Gerar tese com IA");
    expect(locked).not.toContain("Salvar tese");
    expect(locked).toContain("Baixar apresentação (PPT)");
  });
});
