import type {
  EmbeddingProfile,
  EmbeddingResult,
  EmbeddingRuntime,
} from "../ai/embedding_runtime";
import { logWarn } from "../core/logger";
import type { BackendRegistry } from "./registry";
import type { Profile, RoutingConfig } from "./types";

export type EmbeddingBackend = {
  id: string;
  embed(args: { texts: string[] }): Promise<{
    vectors: number[][];
    model: string;
    dims: number;
  }>;
};

export class EmbeddingRouterRuntime implements EmbeddingRuntime {
  constructor(
    private routingConfig: RoutingConfig["embeddings"],
    private backends: BackendRegistry<EmbeddingBackend>,
  ) {}

  async embedText(args: {
    texts: string[];
    profile?: EmbeddingProfile;
  }): Promise<EmbeddingResult> {
    const profile = args.profile ?? this.routingConfig.default_profile;
    const providers =
      this.routingConfig.profiles[profile as Profile] ??
      this.routingConfig.fallback;

    let lastError: Error | undefined;

    for (const providerId of providers) {
      const backendWrapper = this.backends.get(providerId);
      if (!backendWrapper) continue;

      // Check availability like LLM router does
      if (!(await backendWrapper.available())) {
        continue;
      }

      const backend = backendWrapper.runtime;

      try {
        const result = await backend.embed({ texts: args.texts });
        return {
          vectors: result.vectors,
          provider: backend.id,
          model: result.model,
          dims: result.dims,
        };
      } catch (error) {
        logWarn("embedding_router.provider_failed", {
          provider: providerId,
          error,
        });
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw (
      lastError ??
      new Error(`No embedding providers available for profile: ${profile}`)
    );
  }
}
