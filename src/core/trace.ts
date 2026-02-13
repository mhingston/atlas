import { ulid } from "ulid";
import type { Command } from "./commands";

export type TraceEventInput = {
  id?: string;
  trace_id: string;
  job_id?: string | null;
  workflow_id?: string | null;
  kind: string;
  message?: string | null;
  span_id?: string | null;
  parent_span_id?: string | null;
  status?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_ms?: number | null;
  data?: Record<string, unknown>;
  created_at?: string;
};

export type TraceSpan = {
  span_id: string;
  parent_span_id?: string | null;
  kind: string;
  started_at: string;
};

type TraceQueue = {
  enqueue: (cmd: Command) => void;
};

export function createTraceEmitter(
  queue: TraceQueue,
  base: {
    trace_id: string;
    job_id?: string | null;
    workflow_id?: string | null;
  },
) {
  const emit = (event: TraceEventInput) => {
    const id = event.id ?? `tr_${ulid()}`;
    queue.enqueue({
      type: "trace.emit",
      event: {
        id,
        trace_id: event.trace_id,
        job_id: event.job_id ?? null,
        workflow_id: event.workflow_id ?? null,
        kind: event.kind,
        message: event.message ?? null,
        span_id: event.span_id ?? null,
        parent_span_id: event.parent_span_id ?? null,
        status: event.status ?? null,
        started_at: event.started_at ?? null,
        ended_at: event.ended_at ?? null,
        duration_ms: event.duration_ms ?? null,
        data: event.data ?? {},
        created_at: event.created_at ?? new Date().toISOString(),
      },
    });
  };

  const startSpan = (
    kind: string,
    data?: Record<string, unknown>,
    message?: string,
    parentSpanId?: string | null,
  ): TraceSpan => {
    const startedAt = new Date().toISOString();
    const spanId = `sp_${ulid()}`;
    emit({
      trace_id: base.trace_id,
      job_id: base.job_id ?? null,
      workflow_id: base.workflow_id ?? null,
      kind,
      message: message ?? null,
      span_id: spanId,
      parent_span_id: parentSpanId ?? null,
      status: "start",
      started_at: startedAt,
      data: data ?? {},
      created_at: startedAt,
    });
    return {
      span_id: spanId,
      parent_span_id: parentSpanId ?? null,
      kind,
      started_at: startedAt,
    };
  };

  const endSpan = (
    span: TraceSpan,
    status: string,
    data?: Record<string, unknown>,
    message?: string,
  ) => {
    const endedAt = new Date().toISOString();
    const durationMs = Date.parse(endedAt) - Date.parse(span.started_at);
    emit({
      trace_id: base.trace_id,
      job_id: base.job_id ?? null,
      workflow_id: base.workflow_id ?? null,
      kind: span.kind,
      message: message ?? null,
      span_id: span.span_id,
      parent_span_id: span.parent_span_id ?? null,
      status,
      started_at: span.started_at,
      ended_at: endedAt,
      duration_ms: Number.isFinite(durationMs) ? durationMs : null,
      data: data ?? {},
      created_at: endedAt,
    });
  };

  const event = (
    kind: string,
    data?: Record<string, unknown>,
    message?: string,
    status?: string,
  ) => {
    emit({
      trace_id: base.trace_id,
      job_id: base.job_id ?? null,
      workflow_id: base.workflow_id ?? null,
      kind,
      message: message ?? null,
      status: status ?? null,
      data: data ?? {},
    });
  };

  return {
    emit,
    event,
    startSpan,
    endSpan,
  };
}
