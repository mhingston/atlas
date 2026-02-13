import { logError, logInfo, logWarn } from "../core/logger";
import type { CommandQueue } from "../core/queue";
import type { ReadOnlyRepo } from "../core/repo";
import type { PluginRegistry } from "../plugins/registry";
import { runOnce } from "./runner";

/**
 * Simple interval-based scheduler.
 * Periodically runs the job runner to process queued jobs.
 */
export class Scheduler {
  private interval: Timer | null = null;
  private running = false;

  constructor(
    private registry: PluginRegistry,
    private repo: ReadOnlyRepo,
    private commands: CommandQueue,
    private pollIntervalMs = 5000, // Default: 5 seconds
  ) {}

  start() {
    if (this.running) {
      logWarn("scheduler.already_running");
      return;
    }

    this.running = true;
    logInfo("scheduler.start", { interval_ms: this.pollIntervalMs });

    this.interval = setInterval(async () => {
      if (!this.running) return;

      try {
        await runOnce(this.registry, this.repo, this.commands);
      } catch (error) {
        logError("scheduler.run_error", { error });
      }
    }, this.pollIntervalMs);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    logInfo("scheduler.stopped");
  }
}
