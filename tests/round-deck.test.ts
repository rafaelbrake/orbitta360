import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/rounds", () => ({
  createActionItem: vi.fn(), deleteActionItem: vi.fn(), updateActionItem: vi.fn(), copyLeaderDraft: vi.fn(), saveActionItem: vi.fn(), saveRoundNotes: vi.fn(), setPitchValidated: vi.fn(), setRoundPriority: vi.fn(), setRoundPriorityNote: vi.fn(),
}));
vi.mock("@/app/actions/segment", () => ({ saveLeaderPitch: vi.fn() }));
vi.mock("@/app/actions/bu", () => ({ savePitch: vi.fn() }));
vi.mock("next/link", () => ({ default: (p: { href: string; children?: unknown }) => h("a", { href: p.href }, p.children as never) }));

import { RoundDeck, type RoundDeckProps } from "../src/components/RoundDeck";
import type { ActionItem, RoundRow } from "../src/lib/rounds";

const pitch = {
  descricao: "Etiquetas para varejo", dores: "Ruptura de gôndola", proposta_valor: "Etiqueta eletrônica em 30 dias", pitch_abertura: "Quanto custa uma ruptura?",
  pergunta_1: "Quem precifica?", pergunta_2: null, pergunta_3: null, cases: [{ cliente: "Rede Alfa", desafio: "d", solucao: "s", resultado: "Zero rupturas" }],
  perfil_cliente: null, persona_decisora: null, persona_influenciadora: null, funcionarios_min: null, funcionarios_max: null, modelo_receita: "Recorrente", ticket_medio: 1000,
};
const row = (o: Partial<RoundRow> & { offerId: string; name: string; score: number }): RoundRow => ({
  code: "OF-01", buCode: "LBL", classCode: "alta", classLabel: "Prioridade alta", level: null, note: null, pitchValidated: false,
  pitch: null, pitchSource: null, description: null, revenueModel: null, ticket: null, signals: [], ...o,
});
const item = (o: Partial<ActionItem> & { recordId: string }): ActionItem => ({
  custom: false, type: "manter", regional: "Sul", buCode: "LBL", offerName: null, headline: "Manter o piloto", evidence: null, action: "Repetir em 2027", indicator: "Conversão", audience: null, priority: "alta",
  decision: null, owner: "", due: "", note: "", ...o,
});
const BASE: RoundDeckProps = {
  segmentId: "seg-1", segmentName: "Varejo", leader: "Edenei Pereira", final: false, canEdit: true,
  round: { id: "r1", position: 1, name: "Hardware", context: "Mercado cresce 12% ao ano", focoLimit: 5, buCodes: ["ITD", "LBL", "PRT"], buOptions: [{ id: "bu-itd", code: "ITD" }, { id: "bu-lbl", code: "LBL" }, { id: "bu-prt", code: "PRT" }] },
  roundCount: 4, prevRoundId: null, nextRoundId: "r2",
  rows: [
    row({ offerId: "a", name: "Etiqueta eletrônica", score: 90, level: "foco", note: "Maior margem", pitch, pitchSource: "lider", pitchValidated: true, signals: [{ regional: "Sul", type: "manter" }] }),
    row({ offerId: "b", name: "Impressora térmica", score: 60, level: "apoio", buCode: "PRT" }),
    row({ offerId: "c", name: "Oferta sem nível", score: 20, classCode: "baixa", classLabel: "Baixa prioridade" }),
  ],
  items: [item({ recordId: "m1", decision: "validado", owner: "Ana", due: "2027-02-01" }), item({ recordId: "m2", type: "treinar", headline: "Treinar o time em RFID", buCode: "ITD" }), item({ recordId: "n1", custom: true, type: "mudar", buCode: "PRT", headline: "Rever a tabela de preços", action: "Reunião com o comercial", decision: "validado", owner: "Bia" })],
  regional: [{ regional: "Sul", works: "Pitch com gerente funciona", not_works: "Preço trava" }], notes: "Combinado: revisar o case", hasDraft: true,
};
// o React separa textos vizinhos com marcadores <!-- --> no HTML; para conferir o que aparece na tela, eles saem
const render = (over: Partial<RoundDeckProps> = {}) => renderToString(h(RoundDeck, { ...BASE, ...over })).replaceAll("<!-- -->", "");

describe("rodada da reunião: cada tela renderiza com o conteúdo certo", () => {
  it("abertura: rodada, BUs, líder e números", () => {
    const html = render({ initialKey: "abertura" });
    for (const t of ["Rodada 1 de 4", "Varejo", "Hardware", "ITD · LBL · PRT", "Edenei Pereira", "1 de 5", "2 de 3", "Rascunho em edição"]) expect(html).toContain(t);
  });
  it("contexto aparece como tela própria", () => {
    expect(render({ initialKey: "contexto" })).toContain("Mercado cresce 12% ao ano");
  });
  it("mesa: só as ofertas da rodada, com nível, regionais e o botão de partir do rascunho", () => {
    const html = render({ initialKey: "mesa" });
    for (const t of ["Etiqueta eletrônica", "Impressora térmica", "Oferta sem nível", "Sul · Manter", "Foco 1 de 5", "Partir do rascunho do líder", "3 de 3 ofertas"]) expect(html).toContain(t);
  });
  it("sem rascunho do líder ou sem permissão, o botão de copiar não aparece", () => {
    expect(render({ initialKey: "mesa", hasDraft: false })).not.toContain("Partir do rascunho");
    expect(render({ initialKey: "mesa", canEdit: false })).not.toContain("Partir do rascunho");
  });
  it("oferta em Foco: pitch, por que é Foco, validação com os números de mercado e regionais", () => {
    const html = render({ initialKey: "oferta:a" });
    for (const t of ["Etiqueta eletrônica", "Ruptura de gôndola", "Etiqueta eletrônica em 30 dias", "Quanto custa uma ruptura?", "Rede Alfa", "Maior margem", "Pitch validado", "Lapidar o pitch aqui", "versão do segmento", "Sul · Manter"]) expect(html).toContain(t);
    expect(html).toMatch(/type="checkbox"[^>]*checked/);
  });
  it("plano de ação: pontos dos regionais com decisão, responsável e prazo", () => {
    const html = render({ initialKey: "plano" });
    for (const t of ["Plano de ação", "2 de 3 com decisão", "Manter o piloto", "Treinar o time em RFID", "Repetir em 2027", "Indicador:", "Conversão", "Validado", "Pendente", "Incluir item", "2 dos regionais", "1 item novo", "Item novo", "Rever a tabela de preços", "Remover item"]) expect(html).toContain(t);
    expect(html).toContain('value="Ana"');
    expect(html).toContain('value="2027-02-01"');
  });
  it("com a versão final travada, o plano de ação continua editável para o líder e a Diretoria", () => {
    const html = render({ initialKey: "plano", canEdit: false, canEditPlan: true, final: true });
    expect(html).toContain("Versão final");
    expect(html).toContain("Incluir item");
    expect(html).toContain("Remover item");
    expect(html).toContain("O plano de ação segue aberto mesmo com a versão final travada.");
    expect(html).not.toMatch(/aria-label="Decisão sobre o ponto"[^>]*disabled/);
  });
  it("quem não pode editar o plano só lê: sem incluir, sem remover e com os campos desabilitados", () => {
    const ro = render({ initialKey: "plano", canEdit: false, canEditPlan: false, final: true });
    expect(ro).not.toContain("Incluir item");
    expect(ro).not.toContain("Remover item");
    expect(ro).toContain("Rever a tabela de preços");
    expect(ro).toMatch(/<select[^>]*aria-label="Decisão sobre o ponto"[^>]*disabled|<select[^>]*disabled[^>]*aria-label="Decisão sobre o ponto"/);
  });
  it("sem canEditPlan informado, o plano segue a permissão geral (compatível com o que havia)", () => {
    expect(render({ initialKey: "plano", canEdit: false, final: true })).not.toContain("Incluir item");
    expect(render({ initialKey: "plano", canEdit: true })).toContain("Incluir item");
  });
  it("com a versão final travada, o Foco continua em leitura mesmo com o plano editável", () => {
    const html = render({ initialKey: "mesa", canEdit: false, canEditPlan: true, final: true });
    expect(html).toMatch(/<select[^>]*disabled/);
  });
  it("sem nenhum ponto, o plano mostra como incluir um item novo", () => {
    expect(render({ initialKey: "plano", items: [] })).toContain("inclua um item novo");
  });
  it("as regiões vêm antes da mesa de decisão", () => {
    const html = render({ initialKey: "abertura" });
    expect(html.indexOf('aria-label="O que dizem as regiões"')).toBeLessThan(html.indexOf('aria-label="Mesa de decisão"'));
  });
  it("fechamento: Focos, o que falta, anotações e a próxima rodada", () => {
    const html = render({ initialKey: "resumo" });
    for (const t of ["Fechamento da rodada", "Etiqueta eletrônica", "pitch validado", "1 oferta sem nível", "1 ponto dos regionais sem decisão", "Combinado: revisar o case", "Próxima rodada", "/reuniao/seg-1/rodada/r2", "/segmento/seg-1/rodadas"]) expect(html).toContain(t);
  });
  it("na última rodada não há 'próxima rodada'", () => {
    expect(render({ initialKey: "resumo", nextRoundId: null })).not.toContain("Próxima rodada");
  });
  it("versão final travada: tudo em leitura", () => {
    const html = render({ initialKey: "oferta:a", final: true, canEdit: false });
    expect(html).toContain("Versão final");
    expect(html).toContain("Ver o pitch completo");
    expect(html).toMatch(/<select[^>]*disabled/);
  });
  it("sem contexto nem regiões, essas telas não existem", () => {
    const html = render({ initialKey: "contexto", round: { ...BASE.round, context: null }, regional: [] });
    // a tela pedida não existe: cai na mesa de decisão; as telas são abertura, mesa, 1 oferta, plano e fechamento
    expect(html).toContain("2 de 5");
    expect(html).toContain("Mesa de decisão");
    for (const t of ["Contexto", "O que dizem as regiões"]) expect(html).not.toContain(t);
  });
});

describe("nota do pitch na tela da oferta em Foco", () => {
  const score = {
    levels: { dor: 3 as const, proposta: 3 as const, prova: 3 as const, abertura: 2 as const, perguntas: 2 as const, clareza: 1 as const },
    reasons: { abertura: "Boa, mas longa." }, alerts: [{ tipo: "interno" as const, texto: "Valor de contrato no case." }], improvements: ["Cortar a abertura."],
    evaluator: "Claude", evaluatedAt: "2026-11-24T12:00:00Z", stale: false,
  };
  const withScore = (over: Partial<typeof score> = {}) => BASE.rows.map((r) => (r.offerId === "a" ? { ...r, pitchScore: { ...score, ...over } } : r));
  it("mostra total, faixa, critérios, alerta, melhoria e a régua", () => {
    const html = render({ initialKey: "oferta:a", rows: withScore() });
    for (const t of [">83<", "Ajustar antes de usar", "A nota daria pronto, mas há alerta a resolver.", "Dor e alvo", "20 de 20", "Boa, mas longa.", "1 alerta", "Informação interna", "Valor de contrato no case.", "O que melhorar", "Cortar a abertura.", "Como a nota é calculada", "24/11/2026"]) expect(html).toContain(t);
    expect(html).not.toContain("a nota é do texto anterior");
  });
  it("sem alerta, 83 está pronto; pitch alterado é avisado", () => {
    expect(render({ initialKey: "oferta:a", rows: withScore({ alerts: [] }) })).toContain("Pronto para o vendedor");
    expect(render({ initialKey: "oferta:a", rows: withScore({ stale: true }) })).toContain("a nota é do texto anterior");
  });
  it("sem avaliação, a tela diz isso; o fechamento lista a nota de cada Foco", () => {
    expect(render({ initialKey: "oferta:a" })).toContain("Este pitch ainda não foi avaliado.");
    expect(render({ initialKey: "resumo", rows: withScore() })).toContain("nota do pitch 83");
  });
});

describe("botão de reavaliar a nota", () => {
  const score = {
    levels: { dor: 2 as const, proposta: 2 as const, prova: 2 as const, abertura: 2 as const, perguntas: 2 as const, clareza: 2 as const },
    reasons: {}, alerts: [], improvements: [], evaluator: "Claude", evaluatedAt: "2026-11-24T12:00:00Z", stale: false,
  };
  const rows = (pitchScore: typeof score | null) => BASE.rows.map((r) => (r.offerId === "a" ? { ...r, pitchScore } : r));
  const at = (over: Partial<RoundDeckProps>) => render({ initialKey: "oferta:a", ...over });
  it("aparece quando o pitch mudou ou não tem nota", () => {
    expect(at({ canReevaluate: true, rows: rows({ ...score, stale: true }) })).toContain("Reavaliar nota");
    expect(at({ canReevaluate: true, rows: rows(null) })).toContain("Avaliar nota");
  });
  it("não aparece com a nota em dia nem sem a chave configurada", () => {
    expect(at({ canReevaluate: true, rows: rows(score) })).not.toContain("Reavaliar nota");
    expect(at({ rows: rows({ ...score, stale: true }) })).not.toContain("Reavaliar nota");
    expect(at({ rows: rows(null) })).not.toContain("Avaliar nota");
  });
});
