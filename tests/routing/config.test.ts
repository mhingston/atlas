import { describe, expect, test } from "bun:test";
import {
  getDefaultRoutingConfig,
  loadRoutingConfig,
  mergeRoutingConfig,
} from "../../src/routing/config";

describe("routing config", () => {
  test("getDefaultRoutingConfig returns mock and noop defaults", () => {
    const cfg = getDefaultRoutingConfig();
    expect(cfg.llm.default_profile).toBe("balanced");
    expect(cfg.llm.fallback).toContain("mock");
    expect(cfg.harness.fallback).toContain("noop");
  });

  test("mergeRoutingConfig merges profiles and preserves defaults", () => {
    const base = getDefaultRoutingConfig();
    const merged = mergeRoutingConfig(base, {
      llm: { profiles: { fast: ["openai"] } },
      harness: { profiles: { quality: ["codex-cli"] } },
    });

    expect(merged.llm.profiles.fast[0]).toBe("openai");
    expect(merged.llm.profiles.balanced[0]).toBe("mock");
    expect(merged.harness.profiles.quality[0]).toBe("codex-cli");
  });

  test("loadRoutingConfig reads JSON file", async () => {
    const tmpPath = "/tmp/atlas-routing-test.json";
    const sample = getDefaultRoutingConfig();
    await Bun.write(tmpPath, JSON.stringify(sample));

    const loaded = await loadRoutingConfig(tmpPath);
    expect(loaded.llm.default_profile).toBe(sample.llm.default_profile);
  });
});
