import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { PitchData } from "../src/lib/book";
import { EVALUATION_SCHEMA, EVALUATOR_MODEL, EvaluationError, SYSTEM_PROMPT, evaluatePitch, evaluationMessage, type EvaluatorClient } from "../src/lib/pitch-evaluator";
import { reevaluate, type ReevaluateDeps } from "../src/lib/pitch-reevaluate";
import { CRITERIA } from "../src/lib/pitch-score";
import { pitchHash, type PitchScoreRow } from "../src/lib/pitch-score-hash";

const pitch = {
  descricao: "Etiquetas", dores: "Ruptura de gôndola", proposta_valor: "Preço certo", pitch_abertura: "Quanto custa uma ruptura na sua loja?", pergunta_1: "Quem precifica?", pergunta_2: null, pergunta_3: null,
  cases: [{ cliente: "Rede Alfa", desafio: "d", solucao: "s", resultado: "Zero rupturas" }], perfil_cliente: null, persona_decisora: null, persona_influenciadora: null,
  funcionarios_min: null, funcionarios_max: null, modelo_receita: null, ticket_medio: null,
} as PitchData;
const input = { segmento: "Varejo", oferta: "Etiqueta eletrônica", bu: "RTX", pitch };
const each = <T>(v: T) => Object.fromEntries(CRITERIA.map((c) => [c.key, v]));
const answer = { levels: each(2), reasons: each("porque sim"), alerts: [{ tipo: "numero", texto: "sem fonte" }], improvements: ["a", "b", "c", "d"] };

type Message = { stop_reason: string; model: string; content: { type: string; text?: string }[] };
const message = (over: Partial<Message> = {}): Message => ({ stop_reason: "end_turn", model: EVALUATOR_MODEL, content: [{ type: "thinking" }, { type: "text", text: JSON.stringify(answer) }], ...over });
function fake(result: Message | Error) {
  const stream = vi.fn(() => ({ finalMessage: async () => { if (result instanceof Error) throw result; return result; } }));
  return { stream, client: { beta: { messages: { stream } } } as unknown as EvaluatorClient };
}

describe("pedido de avaliação", () => {
  it("leva a régua da tela, o pitch inteiro e a contagem de palavras da abertura", () => {
    for (const c of CRITERIA) for (const t of c.levels) expect(SYSTEM_PROMPT).toContain(t);
    expect(SYSTEM_PROMPT).toContain("Não crie alerta sobre autorização");
    const m = evaluationMessage(input);
    for (const t of ["Segmento: Varejo", "Etiqueta eletrônica (BU RTX)", "Ruptura de gôndola", "(7 palavras)", "Rede Alfa", "Zero rupturas", "Pergunta 2: (vazio)"]) expect(m).toContain(t);
    expect(evaluationMessage({ ...input, pitch: { ...pitch, cases: [] } })).toContain("Cases: (nenhum)");
  });
  it("pede saída estruturada com os seis níveis de 0 a 3", async () => {
    const { stream, client } = fake(message());
    await evaluatePitch(input, client);
    const params = (stream.mock.calls as unknown as [Record<string, unknown>][])[0][0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.output_config).toEqual({ effort: "medium", format: { type: "json_schema", schema: EVALUATION_SCHEMA } });
    expect(Object.keys((EVALUATION_SCHEMA.properties.levels as { properties: object }).properties)).toHaveLength(6);
  });
});

describe("resposta da avaliação", () => {
  it("lê os níveis, os alertas e só três melhorias", async () => {
    const r = await evaluatePitch(input, fake(message()).client);
    expect(r.levels.dor).toBe(2);
    expect(r.alerts).toEqual([{ tipo: "numero", texto: "sem fonte" }]);
    expect(r.improvements).toEqual(["a", "b", "c"]);
    expect(r.model).toBe(EVALUATOR_MODEL);
  });
  it.each([
    ["recusa", message({ stop_reason: "refusal", content: [] })],
    ["resposta cortada", message({ stop_reason: "max_tokens" })],
    ["texto que não é JSON", message({ content: [{ type: "text", text: "nota 7" }] })],
    ["níveis faltando", message({ content: [{ type: "text", text: JSON.stringify({ ...answer, levels: { dor: 2 } }) }] })],
    ["falha de conexão", new Anthropic.APIConnectionError({ message: "x" })],
  ])("%s vira erro com mensagem para a tela", async (_, result) => {
    await expect(evaluatePitch(input, fake(result).client)).rejects.toBeInstanceOf(EvaluationError);
  });
});

describe("reavaliar o pitch salvo", () => {
  const row = (over: Partial<PitchScoreRow> = {}): PitchScoreRow => ({ offer_id: "o", content_hash: pitchHash(pitch), levels: each(1), reasons: {}, alerts: [], improvements: [], evaluator: "Claude", evaluated_at: "2026-11-24T00:00:00Z", ...over });
  const deps = (over: Partial<ReevaluateDeps> = {}) => ({
    loadPitch: async () => input,
    loadScore: async () => row({ content_hash: "0".repeat(64) }),
    evaluate: vi.fn(async () => ({ levels: each(3), reasons: {}, alerts: [], improvements: [], model: EVALUATOR_MODEL }) as never),
    save: vi.fn(async () => {}),
    ...over,
  });

  it("pitch alterado: avalia, grava a impressão do texto atual e informa a nota anterior", async () => {
    const d = deps();
    const r = await reevaluate(d);
    expect(r).toMatchObject({ ok: true, unchanged: false, score: { stale: false, evaluator: EVALUATOR_MODEL } });
    expect(r.ok && r.previousTotal).toBeLessThan(100);
    expect(d.save).toHaveBeenCalledWith(expect.objectContaining({ content_hash: pitchHash(pitch) }));
  });
  it("texto igual ao já avaliado: devolve a nota existente sem chamar a IA", async () => {
    const d = deps({ loadScore: async () => row() });
    expect(await reevaluate(d)).toMatchObject({ ok: true, unchanged: true });
    expect(d.evaluate).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
  });
  it("pitch sem nota é avaliado; sem pitch, não", async () => {
    expect(await reevaluate(deps({ loadScore: async () => undefined }))).toMatchObject({ ok: true, previousTotal: null });
    const d = deps({ loadPitch: async () => null });
    expect(await reevaluate(d)).toMatchObject({ ok: false, status: 400 });
    expect(d.evaluate).not.toHaveBeenCalled();
  });
  it("erro da avaliação chega à tela e nada é gravado", async () => {
    const d = deps({ evaluate: async () => { throw new EvaluationError("Sem crédito."); } });
    expect(await reevaluate(d)).toEqual({ ok: false, status: 502, error: "Sem crédito." });
    expect(d.save).not.toHaveBeenCalled();
  });
});
