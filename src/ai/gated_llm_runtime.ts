/**
 * GatedLLMRuntime: Policy-enforcing wrapper for LLMRuntime
 *
 * Checks policy before allowing LLM operations
 */

import type { Policy } from "../core/policy";
import type {
  GenerateTextArgs,
  GenerateTextResult,
  LLMRuntime,
} from "./llm_runtime";

export class GatedLLMRuntime implements LLMRuntime {
  constructor(
    private runtime: LLMRuntime,
    private policy: Policy,
  ) {}

  async generateText(args: GenerateTextArgs): Promise<GenerateTextResult> {
    this.policy.require("llm:generate", "LLM text generation");
    return this.runtime.generateText(args);
  }
}
