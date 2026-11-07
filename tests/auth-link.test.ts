import { describe, expect, it } from "vitest";
import { parseOtpType, safeNext } from "../src/lib/auth-link";

describe("link de convite / redefinição de senha", () => {
  it("só aceita os tipos de link esperados", () => {
    expect(parseOtpType("invite")).toBe("invite");
    expect(parseOtpType("recovery")).toBe("recovery");
    expect(parseOtpType("email_change")).toBeNull();
    expect(parseOtpType("")).toBeNull();
    expect(parseOtpType(null)).toBeNull();
  });

  it("o destino depois de confirmar é sempre um caminho interno", () => {
    expect(safeNext("/definir-senha")).toBe("/definir-senha");
    expect(safeNext("/bu/PRT/ofertas")).toBe("/bu/PRT/ofertas");
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil.com", "", null, undefined, 42]) expect(safeNext(bad)).toBe("/definir-senha");
    expect(safeNext("x", "/bu")).toBe("/bu");
  });
});
