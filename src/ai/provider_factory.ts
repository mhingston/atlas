/**
 * Provider Factory: Fully dynamic provider loading
 *
 * Works with ANY Vercel AI SDK provider. No hardcoded provider lists.
 * Users configure the provider package and factory function via environment variables.
 */

import { logWarn } from "../core/logger";
import { BackendRegistry } from "../routing/registry";
import type { LLMRuntime } from "./llm_runtime";
import { MockLLMRuntime } from "./llm_runtime";

export class ProviderNotInstalledError extends Error {
  constructor(packageName: string) {
    super(
      `Provider package "${packageName}" is not installed.\nRun: bun add ${packageName}\nOr set ATLAS_LLM_PROVIDER=mock to use the mock provider.`,
    );
    this.name = "ProviderNotInstalledError";
  }
}

type ProviderConfig = {
  package: string;
  factory: string;
  apiKey?: string;
  model?: string;
  baseURL?: string;
  [key: string]: unknown;
};

/**
 * Parse provider configuration from environment
 */
function getProviderConfig(): ProviderConfig | null {
  const provider = process.env.ATLAS_LLM_PROVIDER;
  if (!provider || provider === "mock") {
    return null;
  }

  // Presets for common providers
  const presets: Record<string, ProviderConfig> = {
    openai: {
      package: "@ai-sdk/openai",
      factory: "createOpenAI",
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    },
    anthropic: {
      package: "@ai-sdk/anthropic",
      factory: "createAnthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
    },
    ollama: {
      package: "ollama-ai-provider",
      factory: "ollama",
      baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      model: process.env.OLLAMA_MODEL || "llama3.2",
    },
  };

  if (provider in presets) {
    return presets[provider];
  }

  // Custom provider configuration
  const packageName = process.env.ATLAS_LLM_PACKAGE || provider;
  const factory = process.env.ATLAS_LLM_FACTORY;

  if (!factory) {
    throw new Error(
      `Unknown provider: "${provider}". Either use a preset (openai, anthropic, ollama) or provide:\n  ATLAS_LLM_PACKAGE=@ai-sdk/google\n  ATLAS_LLM_FACTORY=createGoogleGenerativeAI\n  ATLAS_LLM_MODEL=gemini-pro\n  GOOGLE_GENERATIVE_AI_API_KEY=...`,
    );
  }

  // Gather all env vars that might be config
  const config: ProviderConfig = {
    package: packageName,
    factory,
    model: process.env.ATLAS_LLM_MODEL || undefined,
    apiKey: process.env.ATLAS_LLM_API_KEY || undefined,
    baseURL: process.env.ATLAS_LLM_BASE_URL || undefined,
  };

  return config;
}

/**
 * Load the configured LLM provider runtime
 */
export async function loadLLMRuntime(): Promise<LLMRuntime> {
  const config = getProviderConfig();
  const fallback = process.env.ATLAS_LLM_PROVIDER_FALLBACK || "error";

  // Mock provider (default)
  if (!config) {
    return new MockLLMRuntime();
  }

  try {
    return await loadProvider(config);
  } catch (error) {
    if (error instanceof ProviderNotInstalledError) {
      if (fallback === "mock") {
        logWarn("provider_factory.fallback_mock", { error: error.message });
        return new MockLLMRuntime();
      }
      throw error;
    }
    throw error;
  }
}

/**
 * Dynamically load any AI SDK provider
 */
async function loadProvider(config: ProviderConfig): Promise<LLMRuntime> {
  try {
    const providerModule = await import(config.package);
    const { AISDKLLMRuntime } = await import("./aisdk_llm_runtime");

    const factoryFn = providerModule[config.factory];
    if (!factoryFn || typeof factoryFn !== "function") {
      throw new Error(
        `Factory function "${config.factory}" not found in package "${config.package}"`,
      );
    }

    // Build factory config (apiKey, baseURL, etc.)
    const factoryConfig: Record<string, unknown> = {};
    if (config.apiKey) factoryConfig.apiKey = config.apiKey;
    if (config.baseURL) factoryConfig.baseURL = config.baseURL;

    // Create provider instance
    const provider = factoryFn(factoryConfig);

    // Get model
    const modelName = config.model || "default";
    const model =
      typeof provider === "function"
        ? provider(modelName)
        : provider(modelName);

    const providerId = config.package
      .replace(/^@ai-sdk\//, "")
      .replace("ollama-ai-provider", "ollama");
    return new AISDKLLMRuntime(model, providerId, modelName);
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (
      err.code === "ERR_MODULE_NOT_FOUND" ||
      err.code === "MODULE_NOT_FOUND"
    ) {
      throw new ProviderNotInstalledError(config.package);
    }
    throw error;
  }
}

/**
 * Build LLM backend registry with all available providers
 * Uses environment inspection to auto-detect available providers
 */
export async function buildLLMBackendRegistry(): Promise<
  BackendRegistry<LLMRuntime>
> {
  const registry = new BackendRegistry<LLMRuntime>();

  // Mock provider - always available
  registry.register({
    id: "mock",
    runtime: new MockLLMRuntime(),
    available: async () => true,
  });

  // Auto-detect available providers from environment
  const envProviders = [
    { id: "openai", envKey: "OPENAI_API_KEY" },
    { id: "anthropic", envKey: "ANTHROPIC_API_KEY" },
    { id: "ollama", envKey: "OLLAMA_BASE_URL" },
  ];

  for (const { id, envKey } of envProviders) {
    if (process.env[envKey]) {
      const originalProvider = process.env.ATLAS_LLM_PROVIDER;
      try {
        // Temporarily set provider to load it
        process.env.ATLAS_LLM_PROVIDER = id;

        const config = getProviderConfig();
        if (config) {
          const runtime = await loadProvider(config);
          registry.register({
            id,
            runtime,
            available: async () => true,
          });
        }
      } catch (error) {
        logWarn("provider_factory.load_failed", { provider: id, error });
      } finally {
        // Restore original provider
        process.env.ATLAS_LLM_PROVIDER = originalProvider;
      }
    }
  }

  // Custom provider from config
  const customProvider = process.env.ATLAS_LLM_PROVIDER;
  if (
    customProvider &&
    customProvider !== "mock" &&
    !envProviders.some((p) => p.id === customProvider)
  ) {
    try {
      const config = getProviderConfig();
      if (config) {
        const runtime = await loadProvider(config);
        registry.register({
          id: customProvider,
          runtime,
          available: async () => true,
        });
      }
    } catch (error) {
      logWarn("provider_factory.custom_load_failed", {
        provider: customProvider,
        error,
      });
    }
  }

  return registry;
}

import type { EmbeddingBackend } from "../routing/embedding_router";
import { MockEmbeddingRuntime } from "./embedding_runtime";

/**
 * Build Embedding backend registry with all available providers
 */
export async function buildEmbeddingBackendRegistry(): Promise<
  BackendRegistry<EmbeddingBackend>
> {
  const registry = new BackendRegistry<EmbeddingBackend>();

  // Mock provider - always available
  const mockRuntime = new MockEmbeddingRuntime();
  registry.register({
    id: "mock",
    runtime: {
      id: "mock",
      embed: async (args) => {
        const result = await mockRuntime.embedText({
          texts: args.texts,
          profile: "balanced",
        });
        return {
          vectors: result.vectors,
          model: result.model ?? "mock",
          dims: result.dims,
        };
      },
    },
    available: async () => true,
  });

  // OpenAI embedding provider
  if (process.env.OPENAI_API_KEY) {
    try {
      const { OpenAIEmbeddingRuntime } = await import(
        "./openai_embedding_runtime"
      );
      const openaiRuntime = new OpenAIEmbeddingRuntime(
        process.env.OPENAI_API_KEY,
      );

      registry.register({
        id: "openai-embedding-small",
        runtime: {
          id: "openai-embedding-small",
          embed: async (args) => {
            const result = await openaiRuntime.embedText({
              texts: args.texts,
              profile: "fast",
            });
            return {
              vectors: result.vectors,
              model: result.model ?? "text-embedding-3-small",
              dims: result.dims,
            };
          },
        },
        available: async () => true,
      });

      registry.register({
        id: "openai-embedding-large",
        runtime: {
          id: "openai-embedding-large",
          embed: async (args) => {
            const result = await openaiRuntime.embedText({
              texts: args.texts,
              profile: "quality",
            });
            return {
              vectors: result.vectors,
              model: result.model ?? "text-embedding-3-large",
              dims: result.dims,
            };
          },
        },
        available: async () => true,
      });
    } catch (error) {
      logWarn("provider_factory.embedding_openai_failed", { error });
    }
  }

  // Ollama embedding provider
  if (process.env.OLLAMA_BASE_URL) {
    try {
      const { OllamaEmbeddingRuntime } = await import(
        "./ollama_embedding_runtime"
      );
      const ollamaRuntime = new OllamaEmbeddingRuntime(
        process.env.OLLAMA_BASE_URL,
        process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text",
      );

      registry.register({
        id: "ollama-embedding",
        runtime: {
          id: "ollama-embedding",
          embed: async (args) => {
            const result = await ollamaRuntime.embedText({
              texts: args.texts,
              profile: "balanced",
            });
            return {
              vectors: result.vectors,
              model: result.model ?? "nomic-embed-text",
              dims: result.dims,
            };
          },
        },
        available: async () => true,
      });
    } catch (error) {
      logWarn("provider_factory.embedding_ollama_failed", { error });
    }
  }

  return registry;
}
