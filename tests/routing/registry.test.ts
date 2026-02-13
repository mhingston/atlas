import { describe, expect, test } from "bun:test";
import { BackendRegistry } from "../../src/routing/registry";

describe("BackendRegistry", () => {
  test("register and get returns backend", () => {
    const registry = new BackendRegistry<{ ok: boolean }>();
    registry.register({
      id: "test",
      runtime: { ok: true },
      available: async () => true,
    });

    const backend = registry.get("test");
    expect(backend).toBeTruthy();
    expect(backend?.runtime.ok).toBe(true);
  });
});
