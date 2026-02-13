import type { createTraceEmitter } from "../core/trace";
import type {
  GenerateTextArgs,
  GenerateTextResult,
  LLMRuntime,
} from "./llm_runtime";

const MAX_TAGS = 12;
const MAX_SKILLS = 12;

function errorSummary(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }
  return { message: String(error) };
}

export class TracedLLMRuntime implements LLMRuntime {
  constructor(
    private inner: LLMRuntime,
    private trace: ReturnType<typeof createTraceEmitter>,
  ) {}

  async generateText(args: GenerateTextArgs): Promise<GenerateTextResult> {
    const span = this.trace.startSpan(
      "llm.generate",
      {
        profile: args.profile ?? "balanced",
        model: args.model ?? null,
        temperature: args.temperature ?? null,
        max_tokens: args.maxTokens ?? null,
        tags: args.tags ? args.tags.slice(0, MAX_TAGS) : [],
        skills: args.skills ? args.skills.slice(0, MAX_SKILLS) : [],
        auto_skills: args.autoSkills ?? null,
        prompt_chars: args.prompt?.length ?? 0,
        system_chars: args.system?.length ?? 0,
      },
      "LLM generation",
    );

    try {
      const result = await this.inner.generateText(args);
      this.trace.endSpan(span, "ok", {
        provider: result.provider,
        model: result.model ?? null,
        usage: result.usage ?? {},
        output_chars: result.text?.length ?? 0,
      });
      return result;
    } catch (error) {
      this.trace.endSpan(
        span,
        "error",
        { error: errorSummary(error) },
        "LLM generation failed",
      );
      throw error;
    }
  }
}
