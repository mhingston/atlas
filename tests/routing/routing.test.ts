import { describe, expect, test } from "bun:test";
import type { LLMRuntime } from "../../src/ai/llm_runtime";
import type { HarnessRuntime } from "../../src/harness/types";
import { HarnessRouterRuntime } from "../../src/routing/harness_router";
import { LLMRouterRuntime } from "../../src/routing/llm_router";
import { BackendRegistry } from "../../src/routing/registry";
import type { RoutingConfig } from "../../src/routing/types";

describe("Routing Runtimes", () => {
  describe("LLMRouterRuntime", () => {
    test("should route to first available provider", async () => {
      const registry = new BackendRegistry<LLMRuntime>();

      const mockBackend: LLMRuntime = {
        generateText: async (_args) => ({
          text: "mock response",
          provider: "mock-internal",
          model: "mock-model",
        }),
      };

      registry.register({
        id: "mock",
        runtime: mockBackend,
        available: async () => true,
      });

      const config: RoutingConfig["llm"] = {
        default_profile: "balanced",
        profiles: {
          fast: ["mock"],
          balanced: ["mock"],
          quality: ["mock"],
        },
        fallback: [],
      };

      const router = new LLMRouterRuntime(config, registry);
      const result = await router.generateText({ prompt: "test" });

      expect(result.text).toBe("mock response");
      expect(result.provider).toBe("mock");
    });

    test("should fallback when first provider fails", async () => {
      const registry = new BackendRegistry<LLMRuntime>();

      const failingBackend: LLMRuntime = {
        generateText: async () => {
          throw new Error("Provider failed");
        },
      };

      const workingBackend: LLMRuntime = {
        generateText: async (_args) => ({
          text: "fallback response",
          provider: "fallback-internal",
          model: "fallback-model",
        }),
      };

      registry.register({
        id: "failing",
        runtime: failingBackend,
        available: async () => true,
      });

      registry.register({
        id: "working",
        runtime: workingBackend,
        available: async () => true,
      });

      const config: RoutingConfig["llm"] = {
        default_profile: "balanced",
        profiles: {
          fast: ["failing", "working"],
          balanced: ["failing", "working"],
          quality: ["failing", "working"],
        },
        fallback: [],
      };

      const router = new LLMRouterRuntime(config, registry);
      const result = await router.generateText({ prompt: "test" });

      expect(result.provider).toBe("working");
    });

    test("should use profile from args", async () => {
      const registry = new BackendRegistry<LLMRuntime>();

      const fastBackend: LLMRuntime = {
        generateText: async (_args) => ({
          text: "fast response",
          provider: "fast-internal",
          model: "fast-model",
        }),
      };

      const qualityBackend: LLMRuntime = {
        generateText: async (_args) => ({
          text: "quality response",
          provider: "quality-internal",
          model: "quality-model",
        }),
      };

      registry.register({
        id: "fast",
        runtime: fastBackend,
        available: async () => true,
      });

      registry.register({
        id: "quality",
        runtime: qualityBackend,
        available: async () => true,
      });

      const config: RoutingConfig["llm"] = {
        default_profile: "balanced",
        profiles: {
          fast: ["fast"],
          balanced: ["fast"],
          quality: ["quality"],
        },
        fallback: [],
      };

      const router = new LLMRouterRuntime(config, registry);

      const fastResult = await router.generateText({
        prompt: "test",
        profile: "fast",
      });
      expect(fastResult.provider).toBe("fast");

      const qualityResult = await router.generateText({
        prompt: "test",
        profile: "quality",
      });
      expect(qualityResult.provider).toBe("quality");
    });
  });

  describe("HarnessRouterRuntime", () => {
    test("should route to noop harness", async () => {
      const registry = new BackendRegistry<HarnessRuntime>();

      const noopBackend: HarnessRuntime = {
        runTask: async (args) => ({
          mode: args.mode || "propose",
          summary: "noop",
          outputs: [],
          provider: "noop-internal",
        }),
      };

      registry.register({
        id: "noop",
        runtime: noopBackend,
        available: async () => true,
      });

      const config: RoutingConfig["harness"] = {
        default_profile: "balanced",
        profiles: {
          fast: ["noop"],
          balanced: ["noop"],
          quality: ["noop"],
        },
        fallback: [],
      };

      const router = new HarnessRouterRuntime(config, registry);
      const result = await router.runTask({ goal: "test", cwd: "/tmp" });

      expect(result.provider).toBe("noop");
    });

    test("should prefer explicit harnessId", async () => {
      const registry = new BackendRegistry<HarnessRuntime>();

      const explicitBackend: HarnessRuntime = {
        runTask: async (args) => ({
          mode: args.mode || "propose",
          summary: "explicit",
          outputs: [],
          provider: "explicit-internal",
        }),
      };

      const defaultBackend: HarnessRuntime = {
        runTask: async (args) => ({
          mode: args.mode || "propose",
          summary: "default",
          outputs: [],
          provider: "default-internal",
        }),
      };

      registry.register({
        id: "explicit",
        runtime: explicitBackend,
        available: async () => true,
      });

      registry.register({
        id: "default",
        runtime: defaultBackend,
        available: async () => true,
      });

      const config: RoutingConfig["harness"] = {
        default_profile: "balanced",
        profiles: {
          fast: ["default"],
          balanced: ["default"],
          quality: ["default"],
        },
        fallback: [],
      };

      const router = new HarnessRouterRuntime(config, registry);
      const result = await router.runTask({
        goal: "test",
        cwd: "/tmp",
        harnessId: "explicit",
      });

      expect(result.provider).toBe("explicit");
    });
  });
});
