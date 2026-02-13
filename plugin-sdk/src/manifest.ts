/**
 * Atlas Plugin SDK - Manifest Utilities
 *
 * Functions for validating and working with plugin manifests.
 */

import type { ConfigSchema, PluginManifest } from "./types.js";

/**
 * Validate a plugin manifest
 * @throws Error if manifest is invalid
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

  // Validate version format (semver)
  if (!isValidSemver(m.version as string)) {
    throw new Error(`Invalid version format: ${m.version}. Use semver.`);
  }

  // Validate apiVersion format
  if (!isValidApiVersion(m.apiVersion as string)) {
    throw new Error(
      `Invalid apiVersion format: ${m.apiVersion}. Use "X.Y" format.`,
    );
  }

  return manifest as PluginManifest;
}

/**
 * Check if a string is valid semver
 */
function isValidSemver(version: string): boolean {
  // Simple semver check: major.minor.patch with optional prerelease
  const semverRegex =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return semverRegex.test(version);
}

/**
 * Check if a string is valid API version format
 */
function isValidApiVersion(version: string): boolean {
  // API version format: major.minor
  const apiVersionRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  return apiVersionRegex.test(version);
}

/**
 * Check API version compatibility
 * Uses semantic versioning: major version must match
 */
export function checkApiCompatibility(
  pluginApiVersion: string,
  coreApiVersion: string,
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
 * Validate configuration against schema
 */
export function validateConfig(
  config: Record<string, unknown>,
  schema: Record<string, ConfigSchema>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [key, fieldSchema] of Object.entries(schema)) {
    const value = config[key];

    // Check required fields
    if (fieldSchema.required !== false && value === undefined) {
      errors.push(`Missing required field: ${key}`);
      continue;
    }

    // Skip validation if field is not required and not present
    if (value === undefined) {
      continue;
    }

    // Type validation
    const actualType = getValueType(value);
    if (actualType !== fieldSchema.type) {
      errors.push(
        `Field ${key} should be ${fieldSchema.type}, got ${actualType}`,
      );
      continue;
    }

    // Array item validation
    if (
      fieldSchema.type === "array" &&
      fieldSchema.items &&
      Array.isArray(value)
    ) {
      for (let i = 0; i < value.length; i++) {
        const itemType = getValueType(value[i]);
        if (itemType !== fieldSchema.items.type) {
          errors.push(
            `Field ${key}[${i}] should be ${fieldSchema.items.type}, got ${itemType}`,
          );
        }
      }
    }

    // Object property validation
    if (
      fieldSchema.type === "object" &&
      fieldSchema.properties &&
      typeof value === "object" &&
      value !== null
    ) {
      const nestedResult = validateConfig(
        value as Record<string, unknown>,
        fieldSchema.properties,
      );
      errors.push(...nestedResult.errors.map((e) => `${key}.${e}`));
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get the type of a value
 */
function getValueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Apply default values to config
 */
export function applyConfigDefaults(
  config: Record<string, unknown>,
  schema: Record<string, ConfigSchema>,
): Record<string, unknown> {
  const result = { ...config };

  for (const [key, fieldSchema] of Object.entries(schema)) {
    if (result[key] === undefined && fieldSchema.default !== undefined) {
      result[key] = fieldSchema.default;
    }
  }

  return result;
}

/**
 * Create a manifest from partial data (for development)
 */
export function createManifest(
  partial: Partial<PluginManifest> & { id: string; name: string },
): PluginManifest {
  return {
    version: "1.0.0",
    apiVersion: "1.0",
    entry: "./dist/index.js",
    ...partial,
  } as PluginManifest;
}

/**
 * Get plugin display info
 */
export function getPluginInfo(manifest: PluginManifest): {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
} {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description || "No description provided",
    author: manifest.author || "Unknown",
  };
}
