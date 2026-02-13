/**
 * AISDKLLMRuntime: AI SDK wrapper implementation
 *
 * Wraps AI SDK's generateText() function to implement our LLMRuntime interface.
 * Handles type mapping and usage tracking.
 */

import { generateText } from "ai";
import type { LanguageModel } from "ai";
import type {
  GenerateTextArgs,
  GenerateTextResult,
  LLMRuntime,
} from "./llm_runtime";

export class AISDKLLMRuntime implements LLMRuntime {
  constructor(
    private model: LanguageModel,
    private providerName: string,
    private modelName: string,
  ) {}

  async generateText(args: GenerateTextArgs): Promise<GenerateTextResult> {
    const result = await generateText({
      model: this.model,
      system: args.system,
      prompt: args.prompt,
      temperature: args.temperature,
    });

    return {
      text: result.text,
      provider: this.providerName,
      model: this.modelName,
      usage: {
        inputTokens:
          (result.usage as { promptTokens?: number } | undefined)
            ?.promptTokens ?? result.usage?.totalTokens,
        outputTokens:
          (result.usage as { completionTokens?: number } | undefined)
            ?.completionTokens ?? result.usage?.totalTokens,
        totalTokens: result.usage?.totalTokens,
      },
    };
  }
}
