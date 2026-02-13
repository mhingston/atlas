import { describe, expect, test } from "bun:test";
import { GatedLLMRuntime } from "../../src/ai/gated_llm_runtime";
import { MockLLMRuntime } from "../../src/ai/llm_runtime";
import {
  PolicyError,
  createDefaultWorkflowPolicy,
} from "../../src/core/policy";

describe("LLMRuntime", () => {
  describe("MockLLMRuntime", () => {
    test("should generate mock text", async () => {
      const runtime = new MockLLMRuntime();

      const result = await runtime.generateText({
        prompt: "Test prompt",
        temperature: 0.7,
      });

      expect(result.text).toContain("[Mock LLM Response]");
      expect(result.provider).toBe("mock");
      expect(result.usage).toBeDefined();
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    });

    test("should handle system prompt", async () => {
      const runtime = new MockLLMRuntime();

      const result = await runtime.generateText({
        system: "You are a helpful assistant",
        prompt: "Hello",
      });

      expect(result.text).toBeDefined();
      expect(result.provider).toBe("mock");
    });

    test("should respect model parameter", async () => {
      const runtime = new MockLLMRuntime();

      const result = await runtime.generateText({
        prompt: "Test",
        model: "custom-model",
      });

      expect(result.model).toBe("custom-model");
    });
  });

  describe("GatedLLMRuntime", () => {
    test("should allow generateText with llm:generate capability", async () => {
      const policy = createDefaultWorkflowPolicy();
      const mockRuntime = new MockLLMRuntime();
      const gated = new GatedLLMRuntime(mockRuntime, policy);

      const result = await gated.generateText({
        prompt: "Test",
      });

      expect(result.text).toBeDefined();
    });

    test("should deny generateText without llm:generate capability", async () => {
      const policy = createDefaultWorkflowPolicy();
      policy.revoke("llm:generate");

      const mockRuntime = new MockLLMRuntime();
      const gated = new GatedLLMRuntime(mockRuntime, policy);

      expect(async () => {
        await gated.generateText({ prompt: "Test" });
      }).toThrow(PolicyError);
    });
  });
});
