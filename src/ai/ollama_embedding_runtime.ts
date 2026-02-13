import type {
  EmbeddingProfile,
  EmbeddingResult,
  EmbeddingRuntime,
} from "./embedding_runtime";

/**
 * Ollama Embedding Runtime
 * Uses Ollama's local embedding models (e.g., nomic-embed-text)
 */
export class OllamaEmbeddingRuntime implements EmbeddingRuntime {
  constructor(
    private baseURL: string,
    private model = "nomic-embed-text",
  ) {}

  async embedText(args: {
    texts: string[];
    profile?: EmbeddingProfile;
  }): Promise<EmbeddingResult> {
    const vectors: number[][] = [];

    // Ollama embeddings API processes one text at a time
    for (const text of args.texts) {
      const response = await fetch(`${this.baseURL}/api/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama embedding failed: ${error}`);
      }

      const data = (await response.json()) as { embedding: number[] };
      vectors.push(data.embedding);
    }

    const dims = vectors[0]?.length ?? 0;

    return {
      vectors,
      provider: "ollama",
      model: this.model,
      dims,
    };
  }
}
