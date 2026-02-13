import { describe, expect, test } from "bun:test";
import { MockLanguageModelV3 } from "ai/test";
import { AISDKLLMRuntime } from "../../src/ai/aisdk_llm_runtime";

describe("AISDKLLMRuntime", () => {
  test("generateText returns text and usage", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: "text", text: "hello" }],
        finishReason: "stop",
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 2, text: 2, reasoning: 0 },
        },
      }),
    });

    const runtime = new AISDKLLMRuntime(model, "mock-provider", "mock-model");
    const result = await runtime.generateText({ prompt: "hi" });

    expect(result.text).toBe("hello");
    expect(result.provider).toBe("mock-provider");
    expect(result.usage?.totalTokens).toBe(3);
  });
});
