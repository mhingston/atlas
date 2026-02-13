/**
 * Filesystem Source Plugin for Atlas
 *
 * Watch directories and ingest markdown/text files into Atlas.
 *
 * @example
 * ```typescript
 * import plugin from '@atlas/filesystem-source';
 *
 * // Plugin will be loaded by Atlas core
 * export default plugin;
 * ```
 */

import {
  type ExternalPlugin,
  type PluginConfig,
  type PluginHealth,
  applyConfigDefaults,
  createPlugin,
  validateConfig,
} from "@mhingston5/atlas-plugin-sdk";
import { createFilesystemSource } from "./filesystem-source";

// Default configuration
const DEFAULT_CONFIG = {
  watchPaths: [],
  includePatterns: ["**/*.md", "**/*.txt", "**/*.mdx"],
  excludePatterns: ["**/node_modules/**", "**/.git/**"],
  pollInterval: 60,
  defaultTags: ["filesystem"],
};

/**
 * Create the plugin instance
 */
function createPluginInstance(): ExternalPlugin {
  let currentConfig: typeof DEFAULT_CONFIG = { ...DEFAULT_CONFIG };

  return createPlugin({
    manifest: {
      id: "atlas.filesystem-source",
      name: "Filesystem Source",
      version: "1.0.0",
      apiVersion: "1.0",
      description:
        "Watch directories and ingest markdown/text files into Atlas",
      author: "Atlas Team",
      license: "MIT",
      entry: "./dist/index.js",
      config: {
        schema: {
          watchPaths: {
            type: "array",
            description: "Directories to watch for file changes",
            items: { type: "string" },
            required: true,
          },
          includePatterns: {
            type: "array",
            description: "File patterns to include (glob)",
            items: { type: "string" },
            default: ["**/*.md", "**/*.txt", "**/*.mdx"],
          },
          excludePatterns: {
            type: "array",
            description: "File patterns to exclude",
            items: { type: "string" },
            default: ["**/node_modules/**", "**/.git/**"],
          },
          pollInterval: {
            type: "number",
            description: "How often to check for changes (seconds)",
            default: 60,
          },
          defaultTags: {
            type: "array",
            description: "Tags to add to all ingested files",
            items: { type: "string" },
            default: ["filesystem"],
          },
        },
      },
    },

    async initialize(config: PluginConfig) {
      // Validate configuration
      const validation = validateConfig(config.settings, {
        watchPaths: {
          type: "array",
          items: { type: "string" },
          required: true,
        },
        includePatterns: { type: "array", items: { type: "string" } },
        excludePatterns: { type: "array", items: { type: "string" } },
        pollInterval: { type: "number" },
        defaultTags: { type: "array", items: { type: "string" } },
      });

      if (!validation.valid) {
        throw new Error(
          `Invalid configuration: ${validation.errors.join(", ")}`,
        );
      }

      // Apply defaults
      currentConfig = applyConfigDefaults(
        config.settings as typeof DEFAULT_CONFIG,
        DEFAULT_CONFIG as Record<string, { type: string; default?: unknown }>,
      ) as typeof DEFAULT_CONFIG;

      // Validate watch paths exist
      if (!currentConfig.watchPaths.length) {
        throw new Error("At least one watch path must be configured");
      }

      console.log("Filesystem source initialized with config:", currentConfig);
    },

    async shutdown() {
      console.log("Filesystem source shutting down");
    },

    async health(): Promise<PluginHealth> {
      const checks = [];

      // Check if watch paths are accessible
      for (const watchPath of currentConfig.watchPaths) {
        try {
          const { statSync } = await import("node:fs");
          statSync(watchPath);
          checks.push({
            name: `path:${watchPath}`,
            status: "pass" as const,
          });
        } catch {
          checks.push({
            name: `path:${watchPath}`,
            status: "fail" as const,
            message: "Path not accessible",
          });
        }
      }

      const allPass = checks.every((c) => c.status === "pass");

      return {
        status: allPass ? "healthy" : "unhealthy",
        message: allPass
          ? "All watch paths accessible"
          : "Some watch paths are not accessible",
        checks,
      };
    },

    sources: [createFilesystemSource(currentConfig)],
    workflows: [],
    sinks: [],
  });
}

// Export the plugin instance as default
export default createPluginInstance();

// Also export individual components for advanced usage
export { createFilesystemSource };
export type { Config as FilesystemSourceConfig } from "./filesystem-source";
