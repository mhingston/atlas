import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { logInfo, logWarn } from "./core/logger";
import { getDefaultRoutingConfig, loadRoutingConfig } from "./routing/config";
import type { RoutingConfig } from "./routing/types";

/**
 * Load routing configuration with fallback to defaults
 *
 * Priority:
 * 1. gateway.routing.json in cwd
 * 2. Default configuration
 */
export async function loadOrDefaultRoutingConfig(): Promise<RoutingConfig> {
  const configPath = resolve(process.cwd(), "gateway.routing.json");

  if (existsSync(configPath)) {
    try {
      logInfo("config.load", { path: configPath });
      return await loadRoutingConfig(configPath);
    } catch (error) {
      logWarn("config.load_failed", { path: configPath, error });
      logWarn("config.fallback_default");
    }
  }

  return getDefaultRoutingConfig();
}
