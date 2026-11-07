import { describe, expect, it } from "vitest";
import { isMmtComplete, missingFields, mmtStatusOf, sortMmt } from "../src/lib/mmt";

const base = {
  priority: "alta" as const, headline: "h", evidence: "e", reason: "r", action: "a", indicator: "i",
  audience: null, audience_other: null,
};

describe("Manter / Mudar / Treinar — campos obrigatórios", () => {
  it("manter e mudar completos", () => {
    expect(missingFields({ ...base, type: "manter" })).toEqual([]);
    expect(missingFields({ ...base, type: "mudar" })).toEqual([]);
  });

  it("manter e mudar exigem o motivo / causa-raiz", () => {
    expect(missingFields({ ...base, type: "manter", reason: " " })).toEqual(["por que funcionou?"]);
    expect(missingFields({ ...base, type: "mudar", reason: null })).toEqual(["causa-raiz"]);
  });

  it("treinar não exige motivo, mas exige público", () => {
    expect(missingFields({ ...base, type: "treinar", reason: null })).toEqual(["público"]);
    expect(isMmtComplete({ ...base, type: "treinar", reason: null, audience: "AM" })).toBe(true);
  });

  it("público 'Outro' exige informar qual", () => {
    expect(missingFields({ ...base, type: "treinar", audience: "Outro" })).toEqual(["qual público"]);
    expect(isMmtComplete({ ...base, type: "treinar", audience: "Outro", audience_other: "Pré-vendas" })).toBe(true);
  });

  it("prioridade é obrigatória e texto só com espaços conta como vazio", () => {
    expect(missingFields({ ...base, type: "manter", priority: null, headline: "   " })).toEqual(["prioridade", "prática vencedora"]);
  });
});

describe("ordenação e status", () => {
  it("ordena por prioridade (alta primeiro) e depois pelo mais recente; sem prioridade por último", () => {
    const rows = [
      { id: 1, priority: "baixa" as const, updated_at: "2026-11-01" },
      { id: 2, priority: null, updated_at: "2026-11-05" },
      { id: 3, priority: "alta" as const, updated_at: "2026-11-01" },
      { id: 4, priority: "alta" as const, updated_at: "2026-11-03" },
    ];
    expect(sortMmt(rows).map((r) => r.id)).toEqual([4, 3, 1, 2]);
  });

  it("status do diretor", () => {
    expect(mmtStatusOf(null, 0)).toBe("none");
    expect(mmtStatusOf(null, 2)).toBe("progress");
    expect(mmtStatusOf({ status: "draft" }, 2)).toBe("progress");
    expect(mmtStatusOf({ status: "submitted" }, 2)).toBe("submitted");
    expect(mmtStatusOf({ status: "reopened" }, 2)).toBe("reopened");
  });
});
