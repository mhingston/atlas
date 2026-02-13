/**
 * GatedEmbeddingRuntime: Policy-enforcing wrapper for EmbeddingRuntime
 *
 * Checks policy before allowing embedding operations
 */

import type { Policy } from "../core/policy";
import type { EmbeddingResult, EmbeddingRuntime } from "./embedding_runtime";

type EmbedTextArgs = {
  texts: string[];
  profile?: "fast" | "balanced" | "quality";
};

export class GatedEmbeddingRuntime implements EmbeddingRuntime {
  constructor(
    private runtime: EmbeddingRuntime,
    private policy: Policy,
  ) {}

  async embedText(args: EmbedTextArgs): Promise<EmbeddingResult> {
    this.policy.require("embeddings:generate", "Embedding generation");
    return this.runtime.embedText(args);
  }
}
