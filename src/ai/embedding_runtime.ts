/**
 * Embedding Runtime Interface
 *
 * Provides text embedding capabilities for semantic search.
 * Similar to LLMRuntime, but for generating vector embeddings.
 */

export type EmbeddingProfile = "fast" | "balanced" | "quality";

export type EmbeddingResult = {
  vectors: number[][]; // One vector per input text
  provider: string; // e.g., "openai", "mock"
  model?: string; // model identifier
  dims: number; // dimensionality
};

export interface EmbeddingRuntime {
  /**
   * Embed one or more text strings into vector representations
   * @param texts Array of text strings to embed
   * @param profile Quality/speed tradeoff (default: "balanced")
   */
  embedText(args: {
    texts: string[];
    profile?: EmbeddingProfile;
  }): Promise<EmbeddingResult>;
}

/**
 * Mock embedding runtime for testing
 * Generates deterministic "fake" embeddings based on text hash
 */
export class MockEmbeddingRuntime implements EmbeddingRuntime {
  private dims = 384; // MiniLM-like dimensionality

  async embedText(args: {
    texts: string[];
    profile?: EmbeddingProfile;
  }): Promise<EmbeddingResult> {
    const vectors = args.texts.map((text) => this.generateFakeVector(text));

    return {
      vectors,
      provider: "mock",
      model: "mock-embedding",
      dims: this.dims,
    };
  }

  private generateFakeVector(text: string): number[] {
    // Simple hash-based deterministic vector generation
    // Not semantically meaningful, but consistent for testing
    const vector: number[] = [];
    let hash = 0;

    for (let i = 0; i < text.length; i++) {
      const charCode: number = text.charCodeAt(i);
      hash = (hash << 5) - hash + charCode;
      hash = hash & hash; // Convert to 32bit integer
    }

    for (let i = 0; i < this.dims; i++) {
      // Generate pseudo-random values between -1 and 1
      hash = (hash * 9301 + 49297) % 233280;
      vector.push((hash / 233280) * 2 - 1);
    }

    // Normalize to unit length
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0),
    );
    return vector.map((val) => val / magnitude);
  }
}

/**
 * Normalize a vector to unit length (L2 normalization)
 * Safe to call multiple times (idempotent for already-normalized vectors)
 */
export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) {
    return vector; // Return as-is if zero vector
  }
  return vector.map((val) => val / magnitude);
}

/**
 * Cosine similarity between two vectors
 * Handles non-normalized vectors by computing true cosine similarity
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    return -1; // Return -1 for dimension mismatch instead of throwing
  }

  let dotProduct = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal: number = a[i] ?? 0;
    const bVal: number = b[i] ?? 0;
    dotProduct += aVal * bVal;
    aMagnitude += aVal * aVal;
    bMagnitude += bVal * bVal;
  }

  aMagnitude = Math.sqrt(aMagnitude);
  bMagnitude = Math.sqrt(bMagnitude);

  if (aMagnitude === 0 || bMagnitude === 0) {
    return 0; // Return 0 similarity if either vector is zero
  }

  return dotProduct / (aMagnitude * bMagnitude);
}
