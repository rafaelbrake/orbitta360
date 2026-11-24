import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/rounds", () => ({
  copyLeaderDraft: vi.fn(), saveActionItem: vi.fn(), saveRoundNotes: vi.fn(), setPitchValidated: vi.fn(), setRoundPriority: vi.fn(), setRoundPriorityNote: vi.fn(),
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
  type: "manter", regional: "Sul", buCode: "LBL", offerName: null, headline: "Manter o piloto", evidence: null, action: "Repetir em 2027", indicator: "Conversão", audience: null, priority: "alta",
  decision: null, owner: "", due: "", note: "", ...o,
});
const BASE: RoundDeckProps = {
  segmentId: "seg-1", segmentName: "Varejo", leader: "Edenei Pereira", final: false, canEdit: true,
  round: { id: "r1", position: 1, name: "Hardware", context: "Mercado cresce 12% ao ano", focoLimit: 5, buCodes: ["ITD", "LBL", "PRT"] },
  roundCount: 4, prevRoundId: null, nextRoundId: "r2",
  rows: [
    row({ offerId: "a", name: "Etiqueta eletrônica", score: 90, level: "foco", note: "Maior margem", pitch, pitchSource: "lider", pitchValidated: true, signals: [{ regional: "Sul", type: "manter" }] }),
    row({ offerId: "b", name: "Impressora térmica", score: 60, level: "apoio", buCode: "PRT" }),
    row({ offerId: "c", name: "Oferta sem nível", score: 20, classCode: "baixa", classLabel: "Baixa prioridade" }),
  ],
  items: [item({ recordId: "m1", decision: "validado", owner: "Ana", due: "2027-02-01" }), item({ recordId: "m2", type: "treinar", headline: "Treinar o time em RFID", buCode: "ITD" })],
  regional: [{ regional: "Sul", works: "Pitch com gerente funciona", not_works: "Preço trava" }], notes: "Combinado: revisar o case", hasDraft: true,
};
// o React separa textos vizinhos com marcadores <!-- --> no HTML; para conferir o que aparece na tela, eles saem
const render = (over: Partial<RoundDeckProps> = {}) => renderToString(h(RoundDeck, { ...BASE, ...over })).replaceAll("<!-- -->", "");

describe("rodada da reunião: cada tela renderiza com o conteúdo certo", () => {
  it("abertura: rodada, BUs, líder e números", () => {
    const html = render({ initialKey: "abertura" });
    for (const t of ["Rodada 1 de 4", "Varejo", "Hardware", "ITD · LBL · PRT", "Edenei Pereira", "1 de 5", "1 de 2", "Rascunho em edição"]) expect(html).toContain(t);
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
    for (const t of ["Plano de ação", "1 de 2 com decisão", "Manter o piloto", "Treinar o time em RFID", "Repetir em 2027", "Indicador:", "Conversão", "Validado", "Pendente"]) expect(html).toContain(t);
    expect(html).toContain('value="Ana"');
    expect(html).toContain('value="2027-02-01"');
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
  it("sem contexto, regiões nem pontos, essas telas não existem", () => {
    const html = render({ initialKey: "plano", round: { ...BASE.round, context: null }, regional: [], items: [] });
    // a tela pedida não existe: cai na mesa de decisão; as telas são abertura, mesa, 1 oferta e fechamento
    expect(html).toContain("2 de 4");
    expect(html).toContain("Mesa de decisão");
    for (const t of ["Plano de ação", "Contexto", "O que dizem as regiões"]) expect(html).not.toContain(t);
  });
});
