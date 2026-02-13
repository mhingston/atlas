import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { MockLLMRuntime } from "../../src/ai/llm_runtime";
import {
  buildEmbeddingBackendRegistry,
  buildLLMBackendRegistry,
  loadLLMRuntime,
} from "../../src/ai/provider_factory";

function snapshotEnv() {
  return { ...process.env };
}

function restoreEnv(snapshot: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(snapshot)) {
    process.env[key] = value;
  }
}

describe("provider_factory", () => {
  let envSnapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  test("loadLLMRuntime returns mock when provider unset", async () => {
    process.env.ATLAS_LLM_PROVIDER = undefined;

    const runtime = await loadLLMRuntime();
    expect(runtime).toBeInstanceOf(MockLLMRuntime);
  });

  test("loadLLMRuntime returns mock when provider is mock", async () => {
    process.env.ATLAS_LLM_PROVIDER = "mock";

    const runtime = await loadLLMRuntime();
    expect(runtime).toBeInstanceOf(MockLLMRuntime);
  });

  test("loadLLMRuntime throws for custom provider without factory", async () => {
    process.env.ATLAS_LLM_PROVIDER = "custom";
    process.env.ATLAS_LLM_FACTORY = undefined;
    process.env.ATLAS_LLM_PACKAGE = undefined;

    await expect(loadLLMRuntime()).rejects.toThrow("ATLAS_LLM_FACTORY");
  });

  test("buildLLMBackendRegistry includes mock", async () => {
    process.env.OPENAI_API_KEY = undefined;
    process.env.ANTHROPIC_API_KEY = undefined;
    process.env.OLLAMA_BASE_URL = undefined;

    const registry = await buildLLMBackendRegistry();
    const mock = registry.get("mock");
    expect(mock).toBeTruthy();
  });

  test("loadLLMRuntime falls back to mock when provider package missing and fallback=mock", async () => {
    process.env.ATLAS_LLM_PROVIDER = "custom";
    process.env.ATLAS_LLM_PACKAGE = "not-a-real-package";
    process.env.ATLAS_LLM_FACTORY = "createFakeProvider";
    process.env.ATLAS_LLM_PROVIDER_FALLBACK = "mock";

    const runtime = await loadLLMRuntime();
    expect(runtime).toBeInstanceOf(MockLLMRuntime);
  });

  test("loadLLMRuntime loads a custom provider module path", async () => {
    const tempDir = `/tmp/atlas-provider-${Date.now()}`;
    await mkdir(tempDir, { recursive: true });
    const modulePath = `${tempDir}/fake-provider.mjs`;

    await Bun.write(
      modulePath,
      "export function createFakeProvider() { return () => ({}) }",
    );

    process.env.ATLAS_LLM_PROVIDER = "custom";
    process.env.ATLAS_LLM_PACKAGE = modulePath;
    process.env.ATLAS_LLM_FACTORY = "createFakeProvider";

    const runtime = await loadLLMRuntime();
    expect(runtime).toBeTruthy();
  });

  test("buildEmbeddingBackendRegistry includes mock", async () => {
    process.env.OPENAI_API_KEY = undefined;
    process.env.OLLAMA_BASE_URL = undefined;

    const registry = await buildEmbeddingBackendRegistry();
    const mock = registry.get("mock");
    expect(mock).toBeTruthy();

    const result = await mock?.runtime.embed({ texts: ["hello"] });
    expect(result.vectors.length).toBe(1);
    expect(result.dims).toBeGreaterThan(0);
  });
});
