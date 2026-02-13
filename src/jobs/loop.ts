import { logError, logInfo, logWarn } from "../core/logger";
import type { CommandQueue } from "../core/queue";
import type { Writer } from "../core/writer";

/**
 * Single flush loop - owns the writer.
 * Periodically drains command queue and applies batches transactionally.
 * This is the ONLY component that calls writer.applyBatch().
 */
export class FlushLoop {
  private interval: Timer | null = null;
  private running = false;

  constructor(
    private commands: CommandQueue,
    private writer: Writer,
    private batchSize = 100,
    private flushIntervalMs = 100, // Default: 100ms
  ) {}

  start() {
    if (this.running) {
      logWarn("flush_loop.already_running");
      return;
    }

    this.running = true;
    logInfo("flush_loop.start", { interval_ms: this.flushIntervalMs });

    this.flushOnce();

    this.interval = setInterval(() => {
      if (!this.running) return;

      const batch = this.commands.drain(this.batchSize);

      if (batch.length > 0) {
        try {
          this.writer.applyBatch(batch);
          logInfo("flush_loop.batch_applied", { count: batch.length });
        } catch (error) {
          logError("flush_loop.batch_error", { error });
          // Commands are lost - in production, you'd want retry/dead-letter queue
        }
      }
    }, this.flushIntervalMs);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    logInfo("flush_loop.stopped");
  }

  /**
   * Flush once immediately (useful for testing/shutdown)
   */
  flushOnce() {
    const batch = this.commands.drain(this.batchSize);
    if (batch.length > 0) {
      this.writer.applyBatch(batch);
      logInfo("flush_loop.manual_flush", { count: batch.length });
    }
  }
}
