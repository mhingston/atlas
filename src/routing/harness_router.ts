import type {
  HarnessRunArgs,
  HarnessRunResult,
  HarnessRuntime,
} from "../harness/types";
import { NoAvailableProviderError } from "./errors";
import type { BackendRegistry } from "./registry";
import type { Profile, RoutingConfig } from "./types";

export class HarnessRouterRuntime implements HarnessRuntime {
  constructor(
    private cfg: RoutingConfig["harness"],
    private backends: BackendRegistry<HarnessRuntime>,
  ) {}

  async runTask(args: HarnessRunArgs): Promise<HarnessRunResult> {
    const mode = args.mode ?? "propose";
    const profile = (args.profile ?? this.cfg.default_profile) as Profile;

    const list: string[] = [];
    if (args.harnessId) list.push(args.harnessId);
    list.push(
      ...(this.cfg.profiles[profile] ?? []),
      ...(this.cfg.fallback ?? []),
    );

    for (const id of list) {
      const b = this.backends.get(id);
      if (!b) continue;
      if (!(await b.available())) continue;
      try {
        const res = await b.runtime.runTask({ ...args, mode });
        return { ...res, provider: id };
      } catch {}
    }

    throw new NoAvailableProviderError("harness");
  }
}
