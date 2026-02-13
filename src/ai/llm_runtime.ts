/**
 * LLMRuntime: Core abstraction for LLM text generation
 *
 * This interface wraps the AI SDK and provides a consistent API
 * for workflows to generate text regardless of the underlying provider.
 */

export type GenerateTextArgs = {
  system?: string;
  prompt: string;
  model?: string;
  profile?: "fast" | "balanced" | "quality";
  tags?: string[];
  skills?: string[];
  autoSkills?: boolean;
  temperature?: number;
  maxTokens?: number;
};

export type GenerateTextResult = {
  text: string;
  provider: string;
  model?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export interface LLMRuntime {
  generateText(args: GenerateTextArgs): Promise<GenerateTextResult>;
}

/**
 * MockLLMRuntime: Fallback implementation for testing and when no provider is configured
 */
export class MockLLMRuntime implements LLMRuntime {
  async generateText(args: GenerateTextArgs): Promise<GenerateTextResult> {
    const mockResponse = `[Mock LLM Response]
Prompt: ${args.prompt.slice(0, 100)}${args.prompt.length > 100 ? "..." : ""}

This is a simulated response. Configure ATLAS_LLM_PROVIDER to use a real provider.`;

    return {
      text: mockResponse,
      provider: "mock",
      model: args.model || "mock-model",
      usage: {
        inputTokens: args.prompt.length,
        outputTokens: mockResponse.length,
        totalTokens: args.prompt.length + mockResponse.length,
      },
    };
  }
}
