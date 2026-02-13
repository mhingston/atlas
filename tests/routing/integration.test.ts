import { describe, expect, test } from "bun:test";
import { GatedEmbeddingRuntime } from "../../src/ai/gated_embedding_runtime";
import { GatedLLMRuntime } from "../../src/ai/gated_llm_runtime";
import {
  buildEmbeddingBackendRegistry,
  buildLLMBackendRegistry,
} from "../../src/ai/provider_factory";
import {
  DefaultPolicy,
  createDefaultWorkflowPolicy,
} from "../../src/core/policy";
import { buildHarnessBackendRegistry } from "../../src/harness/factory";
import { GatedHarnessRuntime } from "../../src/harness/gated_harness_runtime";
import { getDefaultRoutingConfig } from "../../src/routing/config";
import { EmbeddingRouterRuntime } from "../../src/routing/embedding_router";
import { HarnessRouterRuntime } from "../../src/routing/harness_router";
import { LLMRouterRuntime } from "../../src/routing/llm_router";

describe("Routing Integration", () => {
  test("should build complete routing stack", async () => {
    // This mimics what happens in runner.ts
    const routingConfig = getDefaultRoutingConfig();
    const policy = createDefaultWorkflowPolicy();
    const llmRegistry = await buildLLMBackendRegistry();
    const embeddingRegistry = await buildEmbeddingBackendRegistry();
    const harnessRegistry = buildHarnessBackendRegistry(policy, routingConfig);

    const llmRouter = new LLMRouterRuntime(routingConfig.llm, llmRegistry);
    const embeddingRouter = new EmbeddingRouterRuntime(
      routingConfig.embeddings,
      embeddingRegistry,
    );
    const harnessRouter = new HarnessRouterRuntime(
      routingConfig.harness,
      harnessRegistry,
    );

    const gatedLLM = new GatedLLMRuntime(llmRouter, policy);
    const gatedEmbeddings = new GatedEmbeddingRuntime(embeddingRouter, policy);
    const gatedHarness = new GatedHarnessRuntime(harnessRouter, policy);

    expect(gatedLLM).toBeDefined();
    expect(gatedEmbeddings).toBeDefined();
    expect(gatedHarness).toBeDefined();
  });

  test("should route LLM request through complete stack", async () => {
    const routingConfig = getDefaultRoutingConfig();
    const llmRegistry = await buildLLMBackendRegistry();
    const llmRouter = new LLMRouterRuntime(routingConfig.llm, llmRegistry);
    const policy = createDefaultWorkflowPolicy();
    const gatedLLM = new GatedLLMRuntime(llmRouter, policy);

    // Should route to mock provider (default)
    const result = await gatedLLM.generateText({ prompt: "test" });

    expect(result.provider).toBe("mock");
    expect(result.text).toContain("Mock LLM Response");
  });

  test("should route harness request through complete stack", async () => {
    const routingConfig = getDefaultRoutingConfig();
    const policy = new DefaultPolicy();
    policy.grant("db:read", "llm:generate", "exec:cli", "fs:read:/tmp");
    const harnessRegistry = buildHarnessBackendRegistry(policy, routingConfig);
    const harnessRouter = new HarnessRouterRuntime(
      routingConfig.harness,
      harnessRegistry,
    );
    const gatedHarness = new GatedHarnessRuntime(harnessRouter, policy);

    // Should route to noop harness (default)
    const result = await gatedHarness.runTask({
      goal: "test",
      cwd: "/tmp",
    });

    expect(result.provider).toBe("noop");
    expect(result.summary).toBe("Harness not configured");
  });

  test("should route embedding request through complete stack", async () => {
    const routingConfig = getDefaultRoutingConfig();
    const embeddingRegistry = await buildEmbeddingBackendRegistry();
    const embeddingRouter = new EmbeddingRouterRuntime(
      routingConfig.embeddings,
      embeddingRegistry,
    );
    const policy = createDefaultWorkflowPolicy();
    const gatedEmbeddings = new GatedEmbeddingRuntime(embeddingRouter, policy);

    const result = await gatedEmbeddings.embedText({ texts: ["test"] });

    expect(result.provider).toBe("mock");
    expect(result.vectors[0]?.length).toBeGreaterThan(0);
  });

  test("should respect profile hints", async () => {
    const routingConfig = getDefaultRoutingConfig();
    const llmRegistry = await buildLLMBackendRegistry();
    const llmRouter = new LLMRouterRuntime(routingConfig.llm, llmRegistry);
    const policy = createDefaultWorkflowPolicy();
    const gatedLLM = new GatedLLMRuntime(llmRouter, policy);

    const fastResult = await gatedLLM.generateText({
      prompt: "test",
      profile: "fast",
    });

    const qualityResult = await gatedLLM.generateText({
      prompt: "test",
      profile: "quality",
    });

    // Both should route to mock (default config)
    expect(fastResult.provider).toBe("mock");
    expect(qualityResult.provider).toBe("mock");
  });

  test("should pass through to inner harness", async () => {
    const routingConfig = getDefaultRoutingConfig();
    const policy = new DefaultPolicy();
    policy.grant("db:read", "llm:generate", "exec:noop", "fs:read:/tmp");
    const harnessRegistry = buildHarnessBackendRegistry(policy, routingConfig);
    const harnessRouter = new HarnessRouterRuntime(
      routingConfig.harness,
      harnessRegistry,
    );
    const gatedHarness = new GatedHarnessRuntime(harnessRouter, policy);

    // GatedHarnessRuntime is now a pass-through wrapper
    // Actual policy enforcement happens in ConfigurableCLIHarness
    const result = await gatedHarness.runTask({
      goal: "test",
      cwd: "/tmp",
      mode: "apply",
    });

    expect(result.provider).toBe("noop");
  });
});
