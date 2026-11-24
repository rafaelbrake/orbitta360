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
    for (const t of ["Etiqueta eletrônica", "Ruptura de gôndola", "Etiqueta eletrônica em 30 dias", "Quanto custa uma ruptura?", "Rede Alfa", "Maior margem", "Pitch validado com os números de mercado", "Lapidar o pitch aqui", "versão do segmento", "Sul · Manter"]) expect(html).toContain(t);
    expect(html).toMatch(/type="checkbox"[^>]*checked/);
  });
  it("plano de ação: pontos dos regionais com decisão, responsável e prazo", () => {
    const html = render({ initialKey: "plano" });
    for (const t of ["Plano de ação", "2 de 3 com decisão", "Manter o piloto", "Treinar o time em RFID", "Repetir em 2027", "Indicador:", "Conversão", "Validado", "Pendente", "Incluir item", "2 dos regionais", "1 item novo", "Item novo", "Rever a tabela de preços", "Remover item"]) expect(html).toContain(t);
    expect(html).toContain('value="Ana"');
    expect(html).toContain('value="2027-02-01"');
  });
  it("o botão de incluir item e o de remover só aparecem para quem pode editar", () => {
    const ro = render({ initialKey: "plano", canEdit: false, final: true });
    expect(ro).not.toContain("Incluir item");
    expect(ro).not.toContain("Remover item");
    expect(ro).toContain("Rever a tabela de preços");
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
