/**
 * External Plugin Contract
 *
 * This module defines the interface for plugins loaded from external sources
 * (GitHub repos, npm packages, local paths).
 */

import type { SinkPlugin, SourcePlugin, WorkflowPlugin } from "../types";

// Current API version - bump on breaking changes
export const CORE_API_VERSION = "1.0";

/**
 * Plugin manifest - must be present as atlas.plugin.json
 */
export interface PluginManifest {
  /** Unique plugin identifier (reverse DNS format recommended) */
  id: string;

  /** Human-readable name */
  name: string;

  /** Plugin version (semver) */
  version: string;

  /** Atlas API version this plugin targets */
  apiVersion: string;

  /** Description of what the plugin does */
  description?: string;

  /** Plugin author */
  author?: string;

  /** License */
  license?: string;

  /** Main entry point (relative to plugin root) */
  entry: string;

  /** TypeScript declarations entry */
  types?: string;

  /** Plugin component locations */
  exports?: {
    sources?: string[];
    workflows?: string[];
    sinks?: string[];
  };

  /** Configuration schema */
  config?: {
    schema: Record<string, ConfigSchema>;
  };

  /** Dependencies (npm packages) */
  dependencies?: Record<string, string>;

  /** Minimum Atlas core version */
  minCoreVersion?: string;
}

/**
 * Configuration field schema
 */
export interface ConfigSchema {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  default?: unknown;
  required?: boolean;
  secret?: boolean; // Mask in logs/UI
  items?: ConfigSchema; // For array type
  properties?: Record<string, ConfigSchema>; // For object type
}

/**
 * Plugin runtime interface
 * All external plugins must implement this
 */
export interface ExternalPlugin {
  /** Plugin metadata */
  readonly manifest: PluginManifest;

  /** Initialize plugin with configuration */
  initialize?(config: PluginConfig): Promise<void>;

  /** Cleanup when plugin is unloaded */
  shutdown?(): Promise<void>;

  /** Health check */
  health?(): Promise<PluginHealth>;

  /** Plugin components */
  sources?: SourcePlugin[];
  workflows?: WorkflowPlugin[];
  sinks?: SinkPlugin[];
}

/**
 * Plugin configuration (loaded from core config)
 */
export interface PluginConfig {
  /** Plugin ID */
  id: string;

  /** Source URL or path */
  source: string;

  /** Plugin-specific configuration */
  settings: Record<string, unknown>;

  /** Enabled/disabled */
  enabled: boolean;
}

/**
 * Plugin health status
 */
export interface PluginHealth {
  status: "healthy" | "degraded" | "unhealthy";
  message?: string;
  checks?: Array<{
    name: string;
    status: "pass" | "fail" | "warn";
    message?: string;
  }>;
}

/**
 * Plugin load result
 */
export interface PluginLoadResult {
  success: boolean;
  plugin?: ExternalPlugin;
  error?: PluginLoadError;
  manifest?: PluginManifest;
  components: {
    sources: number;
    workflows: number;
    sinks: number;
  };
}

/**
 * Plugin load error
 */
export interface PluginLoadError {
  code:
    | "MANIFEST_NOT_FOUND"
    | "MANIFEST_INVALID"
    | "API_VERSION_MISMATCH"
    | "DEPENDENCY_ERROR"
    | "LOAD_ERROR"
    | "INITIALIZATION_ERROR"
    | "NOT_FOUND"
    | "NETWORK_ERROR";
  message: string;
  details?: unknown;
}

/**
 * Plugin source types
 */
export type PluginSource =
  | { type: "npm"; package: string; version?: string }
  | { type: "github"; owner: string; repo: string; ref?: string }
  | { type: "local"; path: string }
  | { type: "url"; url: string };

/**
 * Parse plugin source string into structured format
 *
 * Examples:
 *   - "@atlas/filesystem-source" -> npm
 *   - "github:myuser/my-plugin" -> github main branch
 *   - "github:myuser/my-plugin#v1.2.0" -> github tag
 *   - "./local/plugin" -> local path
 *   - "https://example.com/plugin.tgz" -> URL
 */
export function parsePluginSource(source: string): PluginSource {
  // GitHub shorthand: github:owner/repo or github:owner/repo#ref
  if (source.startsWith("github:")) {
    const match = source.match(/^github:([^/]+)\/([^#]+)(?:#(.+))?$/);
    if (!match || !match[1] || !match[2]) {
      throw new Error(`Invalid GitHub source format: ${source}`);
    }
    return {
      type: "github",
      owner: match[1],
      repo: match[2],
      ref: match[3],
    };
  }

  // Local path (starts with ./ or /)
  if (source.startsWith("./") || source.startsWith("/")) {
    return {
      type: "local",
      path: source,
    };
  }

  // URL
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return {
      type: "url",
      url: source,
    };
  }

  // NPM package (default)
  // Handle scoped packages (@scope/name) and versions (@scope/name@1.0.0)
  const match = source.match(/^(@[^/]+\/[^@]+|[^@]+)(?:@(.+))?$/);
  if (!match || !match[1]) {
    throw new Error(`Invalid plugin source: ${source}`);
  }
  return {
    type: "npm",
    package: match[1],
    version: match[2],
  };
}

/**
 * Check API version compatibility
 * Uses semantic versioning: major version must match
 */
export function checkApiCompatibility(
  pluginApiVersion: string,
  coreApiVersion: string = CORE_API_VERSION,
): { compatible: boolean; message?: string } {
  const pluginParts = pluginApiVersion.split(".").map(Number);
  const coreParts = coreApiVersion.split(".").map(Number);

  // Handle cases where version parts might be missing
  const pluginMajor = pluginParts[0] ?? 0;
  const coreMajor = coreParts[0] ?? 0;
  const pluginMinor = pluginParts[1] ?? 0;
  const coreMinor = coreParts[1] ?? 0;

  if (pluginMajor !== coreMajor) {
    return {
      compatible: false,
      message: `API version mismatch: plugin requires v${pluginApiVersion}, core is v${coreApiVersion}. Major versions must match.`,
    };
  }

  if (pluginMinor > coreMinor) {
    return {
      compatible: false,
      message: `Plugin requires newer API features: v${pluginApiVersion} > v${coreApiVersion}`,
    };
  }

  return { compatible: true };
}

/**
 * Validate plugin manifest
 */
export function validateManifest(manifest: unknown): PluginManifest {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Manifest must be an object");
  }

  const m = manifest as Record<string, unknown>;

  // Required fields
  const required = ["id", "name", "version", "apiVersion", "entry"];
  for (const field of required) {
    if (!m[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Type checks
  if (typeof m.id !== "string") throw new Error("id must be a string");
  if (typeof m.name !== "string") throw new Error("name must be a string");
  if (typeof m.version !== "string")
    throw new Error("version must be a string");
  if (typeof m.apiVersion !== "string")
    throw new Error("apiVersion must be a string");
  if (typeof m.entry !== "string") throw new Error("entry must be a string");

  // Validate ID format (reverse DNS recommended)
  if (!m.id.includes(".")) {
    console.warn(
      "Plugin ID should use reverse DNS format (e.g., com.example.plugin)",
    );
  }

  return manifest as PluginManifest;
}
