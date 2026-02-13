import type {
  EmbeddingProfile,
  EmbeddingResult,
  EmbeddingRuntime,
} from "./embedding_runtime";

/**
 * OpenAI Embedding Runtime
 * Uses OpenAI's text-embedding-3-small/large models
 */
export class OpenAIEmbeddingRuntime implements EmbeddingRuntime {
  constructor(private apiKey: string) {}

  async embedText(args: {
    texts: string[];
    profile?: EmbeddingProfile;
  }): Promise<EmbeddingResult> {
    const model =
      args.profile === "quality"
        ? "text-embedding-3-large"
        : "text-embedding-3-small";

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: args.texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding failed: ${error}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
      model: string;
    };

    const vectors = data.data.map((item) => item.embedding);
    const dims = vectors[0]?.length ?? 0;

    return {
      vectors,
      provider: "openai",
      model: data.model,
      dims,
    };
  }
}
