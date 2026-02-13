import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { logWarn } from "../../core/logger";
import type { PluginConfig } from "./types";

export type PluginConfigFile = {
  plugins?: Array<
    | string
    | {
        id: string;
        source: string;
        settings?: Record<string, unknown>;
        enabled?: boolean;
      }
  >;
};

export function loadPluginConfig(
  filePath = resolve(process.cwd(), "atlas.config.json"),
): PluginConfig[] {
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as PluginConfigFile;
    const plugins = parsed.plugins ?? [];

    return plugins.map((entry, index) => {
      if (typeof entry === "string") {
        return {
          id: `plugin_${index + 1}`,
          source: entry,
          settings: {},
          enabled: true,
        } satisfies PluginConfig;
      }

      return {
        id: entry.id,
        source: entry.source,
        settings: entry.settings ?? {},
        enabled: entry.enabled ?? true,
      } satisfies PluginConfig;
    });
  } catch (error) {
    logWarn("plugin.config.load_failed", { path: filePath, error });
    return [];
  }
}
