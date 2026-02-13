/**
 * NoopHarnessRuntime: Default/fallback harness
 *
 * Returns a "not configured" message when no harness is available
 */

import type {
  HarnessRunArgs,
  HarnessRunResult,
  HarnessRuntime,
} from "../types";

export class NoopHarnessRuntime implements HarnessRuntime {
  async runTask(args: HarnessRunArgs): Promise<HarnessRunResult> {
    return {
      mode: args.mode || "propose",
      summary: "Harness not configured",
      provider: "noop",
      outputs: [
        {
          type: "text",
          title: "Configuration Required",
          content:
            "No harness is configured.\n\n" +
            "To enable harness functionality:\n" +
            "1. Set ATLAS_HARNESS_ENABLED=true\n" +
            "2. Configure a harness implementation\n" +
            "3. Ensure policy grants required capabilities (exec:*, fs:write:*)",
        },
      ],
      meta: {
        harnessId: args.harnessId,
        reason: "not_configured",
      },
    };
  }
}
