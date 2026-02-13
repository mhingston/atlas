/**
 * External Plugin System
 *
 * Load plugins from external sources:
 * - NPM packages
 * - GitHub repositories
 * - Local paths
 * - URLs
 */

// Export types
export type {
  ConfigSchema,
  ExternalPlugin,
  PluginConfig,
  PluginHealth,
  PluginLoadError,
  PluginLoadResult,
  PluginManifest,
  PluginSource,
} from "./types";

// Export constants and functions
export {
  checkApiCompatibility,
  CORE_API_VERSION,
  parsePluginSource,
  validateManifest,
} from "./types";

// Export loader
export {
  clearPluginCache,
  listCachedPlugins,
  loadPlugin,
} from "./loader";
