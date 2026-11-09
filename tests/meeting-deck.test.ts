import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// As ações do servidor e o Link do Next não fazem parte do que está sendo verificado aqui.
vi.mock("@/app/actions/segment", () => ({
  finalizeSegment: vi.fn(), saveMeetingNotes: vi.fn(), saveReviewNote: vi.fn(), setPriority: vi.fn(), setReviewDone: vi.fn(), saveStrategy: vi.fn(),
}));
vi.mock("next/link", () => ({ default: (p: { href: string; children?: unknown }) => h("a", { href: p.href }, p.children as never) }));

import { MeetingDeck, type DeckProps, type DeckRow } from "../src/components/MeetingDeck";

const pitch = {
  descricao: "Descrição do SOC", dores: "Ataques de ransomware", proposta_valor: "Reduz o risco em 24x7", pitch_abertura: "Quanto custa uma parada?",
  pergunta_1: "Quem responde a um incidente?", pergunta_2: null, pergunta_3: null, cases: [{ cliente: "Hospital X", desafio: "d", solucao: "s", resultado: "Zero paradas" }],
  perfil_cliente: "Hospitais", persona_decisora: "CIO", persona_influenciadora: null, funcionarios_min: 100, funcionarios_max: 900, modelo_receita: "Recorrente", ticket_medio: 15000,
};
const row = (o: Partial<DeckRow> & { offerId: string; name: string; score: number }): DeckRow => ({
  code: "OF-01", buCode: "CYB", classCode: "alta", classLabel: "Prioridade alta", level: null, note: null, reviewNote: null, reviewDone: false,
  pitch: null, pitchSource: null, description: null, signals: [], ...o,
});
const ROWS: DeckRow[] = [
  row({ offerId: "a", name: "SOC gerenciado", score: 95, level: "foco", note: "Maior margem", pitch, pitchSource: "lider", signals: [{ regional: "Sul", type: "manter" }, { regional: "SP", type: "mudar" }], reviewNote: "Trocar o case", reviewDone: false }),
  row({ offerId: "b", name: "Backup em nuvem", score: 82, classLabel: "Prioridade potencial", classCode: "potencial", level: "apoio", pitch: { ...pitch, proposta_valor: "Recupera em minutos" }, pitchSource: "head" }),
  row({ offerId: "c", name: "Etiquetas RF", score: 40, classCode: "baixa", classLabel: "Baixa prioridade", level: "fora" }),
  row({ offerId: "d", name: "Oferta sem nível", score: 30, classCode: "baixa", classLabel: "Baixa prioridade", level: null }),
];
const BASE: DeckProps = {
  segmentId: "seg-1", segmentName: "Saúde", leader: "Luiz Gustavo Duarte", final: false, canEdit: true, focoLimit: 5,
  strategy: { thesis: "Focar em segurança", message: "Abra pela dor", notes: "Combinado: revisar o case" },
  rows: ROWS, regional: [{ regional: "Sul", works: "Pitch com CIO funciona", not_works: "Preço trava" }], stats: { bus: 2, busTotal: 10, scored: 4 },
};
// o React separa textos vizinhos com marcadores <!-- --> no HTML; para conferir o que aparece na tela, eles saem
const render = (over: Partial<DeckProps> = {}) => renderToString(h(MeetingDeck, { ...BASE, ...over })).replaceAll("<!-- -->", "");

describe("modo reunião: cada tela renderiza com o conteúdo certo", () => {
  it("abertura: segmento, líder e números", () => {
    const html = render({ initialKey: "abertura" });
    expect(html).toContain("Saúde");
    expect(html).toContain("Luiz Gustavo Duarte");
    expect(html).toContain("2 de 10"); // BUs avaliando
    expect(html).toContain("1 de 5");  // Foco usado / limite
    expect(html).toContain("Rascunho em edição");
  });

  it("estratégia, mesa de decisão e oferta em Foco mostram tese, ofertas, pitch, sinais e ajuste", () => {
    expect(render({ initialKey: "estrategia" })).toContain("Focar em segurança");
    const mesa = render({ initialKey: "mesa" });
    for (const n of ["SOC gerenciado", "Backup em nuvem", "Etiquetas RF", "Oferta sem nível"]) expect(mesa).toContain(n);
    expect(mesa).toContain("Sul · Manter");
    const oferta = render({ initialKey: "oferta:a" });
    for (const t of ["SOC gerenciado", "Ataques de ransomware", "Reduz o risco em 24x7", "Quanto custa uma parada?", "Hospital X", "Maior margem", "Ajuste pedido na reunião", "Trocar o case", "versão do segmento"]) expect(oferta).toContain(t);
  });

  it("apoio, regiões e fechamento", () => {
    const apoio = render({ initialKey: "apoio" });
    expect(apoio).toContain("Backup em nuvem");
    expect(apoio).toContain("Recupera em minutos");
    const reg = render({ initialKey: "regioes" });
    expect(reg).toContain("Pitch com CIO funciona");
    expect(reg).toContain("Preço trava");
    const fim = render({ initialKey: "resumo" });
    expect(fim).toContain("Ajustes pendentes (1)");
    expect(fim).toContain("Trocar o case");
    expect(fim).toContain("Combinado: revisar o case");
    expect(fim).toContain("Travar versão final");
    expect(fim).toContain("/book/seg-1");
  });

  it("sem visão regional não há tela de regiões; sem apoio não há tela de apoio", () => {
    const html = render({ regional: [], rows: ROWS.filter((r) => r.level !== "apoio"), initialKey: "resumo" });
    expect(html).not.toContain('aria-label="O que dizem as regiões"');
    expect(html).not.toContain('aria-label="Ofertas de apoio"');
    expect(html).toContain('aria-label="Fechamento"');
  });

  it("versão final: sem botão de travar, avisa que está travada e os controles ficam desativados", () => {
    const fim = render({ final: true, canEdit: false, initialKey: "resumo" });
    expect(fim).toContain("Versão final travada");
    expect(fim).not.toContain("Travar versão final</button>");
    const mesa = render({ final: true, canEdit: false, initialKey: "mesa" });
    expect(mesa).toMatch(/<select[^>]*disabled/);
  });

  it("endereço com tela inexistente volta para a mesa de decisão", () => {
    expect(render({ initialKey: "oferta:nao-existe" })).toContain("Mesa de decisão");
  });
});
