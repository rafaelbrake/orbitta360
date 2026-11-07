import { afterEach, describe, expect, it, vi } from "vitest";

describe("interruptor da área dos Diretores Comerciais", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it("fica oculta por padrão", async () => {
    vi.stubEnv("ENABLE_DIRECTORS", "");
    vi.resetModules();
    expect((await import("../src/lib/features")).DIRECTORS_ENABLED).toBe(false);
  });

  it("só liga com ENABLE_DIRECTORS=true (qualquer outro valor mantém oculta)", async () => {
    vi.stubEnv("ENABLE_DIRECTORS", "true");
    vi.resetModules();
    expect((await import("../src/lib/features")).DIRECTORS_ENABLED).toBe(true);
    vi.stubEnv("ENABLE_DIRECTORS", "1");
    vi.resetModules();
    expect((await import("../src/lib/features")).DIRECTORS_ENABLED).toBe(false);
  });
});
