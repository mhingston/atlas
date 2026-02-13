import type { createTraceEmitter } from "../core/trace";
import type { EmbeddingResult, EmbeddingRuntime } from "./embedding_runtime";

function errorSummary(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }
  return { message: String(error) };
}

type EmbedTextArgs = {
  texts: string[];
  profile?: "fast" | "balanced" | "quality";
};

export class TracedEmbeddingRuntime implements EmbeddingRuntime {
  constructor(
    private inner: EmbeddingRuntime,
    private trace: ReturnType<typeof createTraceEmitter>,
  ) {}

  async embedText(args: EmbedTextArgs): Promise<EmbeddingResult> {
    const span = this.trace.startSpan(
      "embeddings.generate",
      {
        profile: args.profile ?? "balanced",
        texts: args.texts.length,
        chars: args.texts.reduce((sum, text) => sum + text.length, 0),
      },
      "Embedding generation",
    );

    try {
      const result = await this.inner.embedText(args);
      this.trace.endSpan(span, "ok", {
        provider: result.provider,
        model: result.model ?? null,
        dims: result.dims,
        vectors: result.vectors.length,
      });
      return result;
    } catch (error) {
      this.trace.endSpan(
        span,
        "error",
        { error: errorSummary(error) },
        "Embedding generation failed",
      );
      throw error;
    }
  }
}
