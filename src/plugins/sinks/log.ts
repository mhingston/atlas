import { logInfo } from "../../core/logger";
import type { SinkPlugin } from "../types";

/**
 * Log sink that logs domain events to console.
 * Marks events as delivered after processing.
 */
export const logSink: SinkPlugin = {
  id: "log.sink",

  async handle(domainEvent, ctx) {
    logInfo("sink.domain_event", {
      type: domainEvent.type,
      id: domainEvent.id,
      aggregate_id: domainEvent.aggregate_id,
      payload: domainEvent.payload,
      created_at: domainEvent.created_at,
    });

    // Mark as delivered
    ctx.commands.enqueue({
      type: "domainEvent.markDelivered",
      id: domainEvent.id,
    });
  },
};
