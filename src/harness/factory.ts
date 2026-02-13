/**
 * Harness Factory: Load configured harness runtimes from routing config
 *
 * Supports config-driven CLI harnesses - add new tools via JSON configuration.
 */

import { logWarn } from "../core/logger";
import type { Policy } from "../core/policy";
import { BackendRegistry } from "../routing/registry";
import type { RoutingConfig } from "../routing/types";
import { ConfigurableCLIHarness } from "./impl/configurable_cli_harness";
import { NoopHarnessRuntime } from "./impl/noop_harness";
import type { HarnessRuntime } from "./types";

/**
 * Build Harness backend registry with all configured harnesses
 */
export function buildHarnessBackendRegistry(
  policy: Policy,
  routingConfig: RoutingConfig,
): BackendRegistry<HarnessRuntime> {
  const registry = new BackendRegistry<HarnessRuntime>();

  // Noop harness - always available
  registry.register({
    id: "noop",
    runtime: new NoopHarnessRuntime(),
    available: async () => true,
  });

  // Load config-driven harnesses
  if (routingConfig.harnesses) {
    for (const [id, config] of Object.entries(routingConfig.harnesses)) {
      try {
        const runtime = new ConfigurableCLIHarness(id, config, policy);
        registry.register({
          id,
          runtime,
          available: async () => {
            // Check if command exists
            try {
              const proc = Bun.spawn(["which", config.command], {
                stdout: "pipe",
                stderr: "pipe",
              });
              await proc.exited;
              return proc.exitCode === 0;
            } catch {
              return false;
            }
          },
        });
      } catch (error) {
        logWarn("harness_factory.load_failed", { harness_id: id, error });
      }
    }
  }

  return registry;
}
