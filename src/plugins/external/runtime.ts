import { logError, logInfo, logWarn } from "../../core/logger";
import type { PluginRegistry } from "../registry";
import { loadPlugin } from "./loader";
import type { ExternalPlugin, PluginConfig, PluginLoadResult } from "./types";

type PluginRuntimeState = {
  plugin: ExternalPlugin;
  config: PluginConfig;
  load: PluginLoadResult;
};

export class ExternalPluginRuntime {
  private states: PluginRuntimeState[] = [];

  constructor(private registry: PluginRegistry) {}

  async loadAll(configs: PluginConfig[]) {
    for (const config of configs) {
      if (!config.enabled) {
        logInfo("plugin.runtime.disabled", {
          id: config.id,
          source: config.source,
        });
        continue;
      }

      const result = await loadPlugin(config.source, config);
      if (!result.success || !result.plugin) {
        logWarn("plugin.runtime.load_failed", {
          id: config.id,
          source: config.source,
          error: result.error,
        });
        continue;
      }

      const plugin = result.plugin;
      this.states.push({ plugin, config, load: result });
      this.registerComponents(plugin);
    }
  }

  private registerComponents(plugin: ExternalPlugin) {
    for (const source of plugin.sources ?? []) {
      this.registry.registerSource(source);
    }
    for (const workflow of plugin.workflows ?? []) {
      this.registry.registerWorkflow(workflow);
    }
    for (const sink of plugin.sinks ?? []) {
      this.registry.registerSink(sink);
    }
  }

  async shutdownAll() {
    for (const state of this.states) {
      if (!state.plugin.shutdown) {
        continue;
      }
      try {
        await state.plugin.shutdown();
      } catch (error) {
        logError("plugin.runtime.shutdown_failed", {
          id: state.plugin.manifest.id,
          error,
        });
      }
    }
  }

  async healthCheckAll() {
    const results = [] as Array<{
      id: string;
      status: string;
      details?: unknown;
    }>;

    for (const state of this.states) {
      if (!state.plugin.health) {
        continue;
      }
      try {
        const health = await state.plugin.health();
        results.push({
          id: state.plugin.manifest.id,
          status: health.status,
          details: health,
        });
      } catch (error) {
        results.push({
          id: state.plugin.manifest.id,
          status: "error",
          details: error,
        });
      }
    }

    return results;
  }
}
