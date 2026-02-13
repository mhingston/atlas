import { describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { loadOrDefaultRoutingConfig } from "../src/config";

describe("loadOrDefaultRoutingConfig", () => {
  test("falls back to defaults when routing config is invalid", async () => {
    const originalCwd = process.cwd();
    const tempDir = `/tmp/atlas-config-${Date.now()}`;
    await mkdir(tempDir, { recursive: true });
    await Bun.write(`${tempDir}/gateway.routing.json`, "{not: 'json'}");
    process.chdir(tempDir);

    try {
      const config = await loadOrDefaultRoutingConfig();
      expect(config.llm.fallback).toContain("mock");
    } finally {
      process.chdir(originalCwd);
    }
  });
});
