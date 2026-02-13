import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { logError, logInfo } from "../../core/logger";
import type {
  ExternalPlugin,
  PluginConfig,
  PluginLoadError,
  PluginLoadResult,
  PluginManifest,
} from "./types";
import {
  CORE_API_VERSION,
  checkApiCompatibility,
  parsePluginSource,
  validateManifest,
} from "./types";

/**
 * Plugin cache directory
 */
const PLUGIN_CACHE_DIR =
  process.env.ATLAS_PLUGIN_CACHE ?? join(tmpdir(), "atlas-plugins");

/**
 * Load a plugin from a source string
 */
export async function loadPlugin(
  source: string,
  config: PluginConfig,
): Promise<PluginLoadResult> {
  try {
    const pluginSource = parsePluginSource(source);
    logInfo("plugin.loader.start", { source, type: pluginSource.type });

    let pluginDir: string;

    switch (pluginSource.type) {
      case "npm":
        pluginDir = await loadFromNpm(
          pluginSource.package,
          pluginSource.version,
        );
        break;
      case "github":
        pluginDir = await loadFromGitHub(
          pluginSource.owner,
          pluginSource.repo,
          pluginSource.ref,
        );
        break;
      case "local":
        pluginDir = await loadFromLocal(pluginSource.path);
        break;
      case "url":
        pluginDir = await loadFromUrl(pluginSource.url);
        break;
      default:
        throw new Error("Unsupported plugin source type");
    }

    // Read and validate manifest
    const manifestPath = join(pluginDir, "atlas.plugin.json");
    if (!existsSync(manifestPath)) {
      return {
        success: false,
        error: {
          code: "MANIFEST_NOT_FOUND",
          message: `Plugin manifest not found at ${manifestPath}`,
        },
        components: { sources: 0, workflows: 0, sinks: 0 },
      };
    }

    let manifest: PluginManifest;
    try {
      const manifestContent = readFileSync(manifestPath, "utf-8");
      manifest = validateManifest(JSON.parse(manifestContent));
    } catch (err) {
      return {
        success: false,
        error: {
          code: "MANIFEST_INVALID",
          message: `Invalid plugin manifest: ${err instanceof Error ? err.message : String(err)}`,
        },
        components: { sources: 0, workflows: 0, sinks: 0 },
      };
    }

    // Check API version compatibility
    const compatibility = checkApiCompatibility(
      manifest.apiVersion,
      CORE_API_VERSION,
    );
    if (!compatibility.compatible) {
      return {
        success: false,
        error: {
          code: "API_VERSION_MISMATCH",
          message: compatibility.message ?? "API version mismatch",
        },
        manifest,
        components: { sources: 0, workflows: 0, sinks: 0 },
      };
    }

    // Load the plugin module
    const entryPath = resolve(pluginDir, manifest.entry);
    if (!existsSync(entryPath)) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Plugin entry not found: ${entryPath}`,
        },
        manifest,
        components: { sources: 0, workflows: 0, sinks: 0 },
      };
    }

    let plugin: ExternalPlugin;
    try {
      const module = await import(entryPath);
      plugin = module.default ?? module;

      // Validate plugin interface - ensure manifest exists
      if (!plugin.manifest) {
        // Plugin didn't provide manifest, use the one we parsed
        Object.defineProperty(plugin, "manifest", {
          value: manifest,
          writable: false,
          configurable: true,
        });
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: "LOAD_ERROR",
          message: `Failed to load plugin: ${err instanceof Error ? err.message : String(err)}`,
          details: err,
        },
        manifest,
        components: { sources: 0, workflows: 0, sinks: 0 },
      };
    }

    // Initialize plugin
    if (plugin.initialize) {
      try {
        await plugin.initialize(config);
      } catch (err) {
        return {
          success: false,
          error: {
            code: "INITIALIZATION_ERROR",
            message: `Plugin initialization failed: ${err instanceof Error ? err.message : String(err)}`,
            details: err,
          },
          manifest,
          components: { sources: 0, workflows: 0, sinks: 0 },
        };
      }
    }

    // Count components
    const components = {
      sources: plugin.sources?.length ?? 0,
      workflows: plugin.workflows?.length ?? 0,
      sinks: plugin.sinks?.length ?? 0,
    };

    logInfo("plugin.loader.success", {
      id: manifest.id,
      version: manifest.version,
      components,
    });

    return {
      success: true,
      plugin,
      manifest,
      components,
    };
  } catch (err) {
    const loadError: PluginLoadError = {
      code: "LOAD_ERROR",
      message: err instanceof Error ? err.message : String(err),
      details: err,
    };

    logError("plugin.loader.error", { source, error: loadError });

    return {
      success: false,
      error: loadError,
      components: { sources: 0, workflows: 0, sinks: 0 },
    };
  }
}

/**
 * Load plugin from NPM package
 */
async function loadFromNpm(
  packageName: string,
  version?: string,
): Promise<string> {
  // For now, assume the package is already installed in node_modules
  // In the future, we could install it dynamically
  const modulePath = require.resolve(`${packageName}/package.json`);
  const pluginDir = modulePath.replace("/package.json", "");

  logInfo("plugin.loader.npm", {
    package: packageName,
    version,
    path: pluginDir,
  });

  return pluginDir;
}

/**
 * Load plugin from GitHub repository
 */
async function loadFromGitHub(
  owner: string,
  repo: string,
  ref = "main",
): Promise<string> {
  const cacheKey = `${owner}-${repo}-${ref}`;
  const cacheDir = join(PLUGIN_CACHE_DIR, cacheKey);

  // Check cache first
  if (existsSync(cacheDir)) {
    logInfo("plugin.loader.github.cache", { owner, repo, ref, path: cacheDir });
    return cacheDir;
  }

  // Create cache directory
  mkdirSync(cacheDir, { recursive: true });

  try {
    // Download tarball from GitHub
    const tarballUrl = `https://github.com/${owner}/${repo}/archive/${ref}.tar.gz`;
    logInfo("plugin.loader.github.download", { url: tarballUrl });

    const response = await fetch(tarballUrl);
    if (!response.ok) {
      throw new Error(`Failed to download: HTTP ${response.status}`);
    }

    const tarball = await response.arrayBuffer();

    // Save tarball temporarily
    const tarballPath = join(cacheDir, "plugin.tar.gz");
    writeFileSync(tarballPath, Buffer.from(tarball));

    // Extract tarball (using tar command)
    execSync(`tar -xzf ${tarballPath} -C ${cacheDir} --strip-components=1`);

    // Clean up tarball
    rmSync(tarballPath);

    logInfo("plugin.loader.github.extracted", {
      owner,
      repo,
      ref,
      path: cacheDir,
    });

    return cacheDir;
  } catch (err) {
    // Clean up on error
    if (existsSync(cacheDir)) {
      rmSync(cacheDir, { recursive: true });
    }
    throw err;
  }
}

/**
 * Load plugin from local path
 */
async function loadFromLocal(path: string): Promise<string> {
  const resolvedPath = resolve(path);

  if (!existsSync(resolvedPath)) {
    throw new Error(`Local plugin path not found: ${resolvedPath}`);
  }

  logInfo("plugin.loader.local", { path: resolvedPath });

  return resolvedPath;
}

/**
 * Load plugin from URL
 */
async function loadFromUrl(url: string): Promise<string> {
  const cacheKey = Buffer.from(url)
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "");
  const cacheDir = join(PLUGIN_CACHE_DIR, cacheKey);

  // Check cache
  if (existsSync(cacheDir)) {
    logInfo("plugin.loader.url.cache", { url, path: cacheDir });
    return cacheDir;
  }

  // Create cache directory
  mkdirSync(cacheDir, { recursive: true });

  try {
    logInfo("plugin.loader.url.download", { url });

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download: HTTP ${response.status}`);
    }

    const content = await response.arrayBuffer();

    // Determine file type and extract accordingly
    const isTarball = url.endsWith(".tar.gz") || url.endsWith(".tgz");

    if (isTarball) {
      const tarballPath = join(cacheDir, "plugin.tar.gz");
      writeFileSync(tarballPath, Buffer.from(content));

      execSync(`tar -xzf ${tarballPath} -C ${cacheDir} --strip-components=1`);
      rmSync(tarballPath);
    } else {
      // Assume it's a single file or zip
      const filePath = join(cacheDir, "plugin.zip");
      writeFileSync(filePath, Buffer.from(content));

      execSync(`unzip -q ${filePath} -d ${cacheDir}`);
      rmSync(filePath);
    }

    logInfo("plugin.loader.url.extracted", { url, path: cacheDir });

    return cacheDir;
  } catch (err) {
    // Clean up on error
    if (existsSync(cacheDir)) {
      rmSync(cacheDir, { recursive: true });
    }
    throw err;
  }
}

/**
 * Clear plugin cache
 */
export function clearPluginCache(): void {
  if (existsSync(PLUGIN_CACHE_DIR)) {
    rmSync(PLUGIN_CACHE_DIR, { recursive: true });
    logInfo("plugin.loader.cache.cleared", { dir: PLUGIN_CACHE_DIR });
  }
}

/**
 * List cached plugins
 */
export function listCachedPlugins(): string[] {
  if (!existsSync(PLUGIN_CACHE_DIR)) {
    return [];
  }

  return readdirSync(PLUGIN_CACHE_DIR);
}
