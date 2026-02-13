import type {
  GenerateTextArgs,
  GenerateTextResult,
  LLMRuntime,
} from "../ai/llm_runtime";
import { logWarn } from "../core/logger";
import { NoAvailableProviderError } from "./errors";
import type { BackendRegistry } from "./registry";
import type { Profile, RoutingConfig } from "./types";

export class LLMRouterRuntime implements LLMRuntime {
  constructor(
    private cfg: RoutingConfig["llm"],
    private backends: BackendRegistry<LLMRuntime>,
  ) {}

  async generateText(args: GenerateTextArgs): Promise<GenerateTextResult> {
    const profile = (args.profile ?? this.cfg.default_profile) as Profile;
    const attemptList = [
      ...(this.cfg.profiles[profile] ?? []),
      ...(this.cfg.fallback ?? []),
    ];

    for (const id of attemptList) {
      const b = this.backends.get(id);
      if (!b) continue;
      if (!(await b.available())) continue;
      try {
        const res = await b.runtime.generateText(args);
        return { ...res, provider: id };
      } catch (error) {
        logWarn("llm_router.provider_failed", { provider: id, error });
      }
    }

    throw new NoAvailableProviderError("llm");
  }
}
