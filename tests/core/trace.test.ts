import { describe, expect, test } from "bun:test";
import type { Command } from "../../src/core/commands";
import { createTraceEmitter } from "../../src/core/trace";

describe("createTraceEmitter", () => {
  test("emits events with base fields and data", () => {
    const commands: Command[] = [];
    const trace = createTraceEmitter(
      { enqueue: (cmd) => commands.push(cmd) },
      {
        trace_id: "tr_1",
        job_id: "job_1",
        workflow_id: "wf_1",
      },
    );

    trace.event("trace.test", { ok: true }, "hello", "ok");

    expect(commands).toHaveLength(1);
    const event = commands[0];
    expect(event.type).toBe("trace.emit");
    if (event.type !== "trace.emit") return;
    expect(event.event.trace_id).toBe("tr_1");
    expect(event.event.job_id).toBe("job_1");
    expect(event.event.workflow_id).toBe("wf_1");
    expect(event.event.kind).toBe("trace.test");
    expect(event.event.message).toBe("hello");
    expect(event.event.status).toBe("ok");
    expect(event.event.data).toEqual({ ok: true });
    expect(typeof event.event.created_at).toBe("string");
  });

  test("tracks span start and end", () => {
    const commands: Command[] = [];
    const trace = createTraceEmitter(
      { enqueue: (cmd) => commands.push(cmd) },
      {
        trace_id: "tr_span",
        job_id: null,
        workflow_id: null,
      },
    );

    const span = trace.startSpan(
      "span.test",
      { phase: "start" },
      "begin",
      "parent_span",
    );
    expect(span.span_id.startsWith("sp_")).toBe(true);

    trace.endSpan(span, "ok", { phase: "end" }, "done");

    expect(commands).toHaveLength(2);
    const start = commands[0];
    const end = commands[1];
    expect(start.type).toBe("trace.emit");
    expect(end.type).toBe("trace.emit");
    if (start.type !== "trace.emit" || end.type !== "trace.emit") return;
    expect(start.event.status).toBe("start");
    expect(start.event.span_id).toBe(span.span_id);
    expect(start.event.parent_span_id).toBe("parent_span");
    expect(start.event.data).toEqual({ phase: "start" });
    expect(end.event.status).toBe("ok");
    expect(end.event.span_id).toBe(span.span_id);
    expect(end.event.started_at).toBe(span.started_at);
    expect(end.event.ended_at).toBeTruthy();
    expect(typeof end.event.duration_ms).toBe("number");
    expect(end.event.data).toEqual({ phase: "end" });
  });
});
