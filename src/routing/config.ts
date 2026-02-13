import type { RoutingConfig } from "./types";

export async function loadRoutingConfig(path: string): Promise<RoutingConfig> {
  const file = Bun.file(path);
  const raw = await file.json();
  return raw as RoutingConfig;
}

export function mergeRoutingConfig(
  base: RoutingConfig,
  override: Partial<RoutingConfig>,
): RoutingConfig {
  return {
    llm: {
      ...base.llm,
      ...(override.llm ?? {}),
      profiles: { ...base.llm.profiles, ...(override.llm?.profiles ?? {}) },
    },
    embeddings: {
      ...base.embeddings,
      ...(override.embeddings ?? {}),
      profiles: {
        ...base.embeddings.profiles,
        ...(override.embeddings?.profiles ?? {}),
      },
    },
    harness: {
      ...base.harness,
      ...(override.harness ?? {}),
      profiles: {
        ...base.harness.profiles,
        ...(override.harness?.profiles ?? {}),
      },
    },
  };
}

export function getDefaultRoutingConfig(): RoutingConfig {
  return {
    llm: {
      default_profile: "balanced",
      profiles: {
        fast: ["mock"],
        balanced: ["mock"],
        quality: ["mock"],
      },
      fallback: ["mock"],
    },
    embeddings: {
      default_profile: "balanced",
      profiles: {
        fast: ["mock"],
        balanced: ["mock"],
        quality: ["mock"],
      },
      fallback: ["mock"],
    },
    harness: {
      default_profile: "balanced",
      profiles: {
        fast: ["noop"],
        balanced: ["noop"],
        quality: ["noop"],
      },
      fallback: ["noop"],
    },
  };
}
