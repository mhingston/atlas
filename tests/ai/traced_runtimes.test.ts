import { describe, expect, test } from "bun:test";
import type { EmbeddingRuntime } from "../../src/ai/embedding_runtime";
import type { LLMRuntime } from "../../src/ai/llm_runtime";
import { TracedEmbeddingRuntime } from "../../src/ai/traced_embedding_runtime";
import { TracedLLMRuntime } from "../../src/ai/traced_llm_runtime";
import type { Command } from "../../src/core/commands";
import { createTraceEmitter } from "../../src/core/trace";
import { TracedHarnessRuntime } from "../../src/harness/traced_harness_runtime";
import type { HarnessRuntime } from "../../src/harness/types";

function getTraceData(event: { data?: Record<string, unknown> }) {
  if (!event.data) {
    throw new Error("Expected trace data");
  }
  return event.data;
}

function getField<T>(data: Record<string, unknown>, key: string): T {
  return data[key] as T;
}

function makeTrace(commands: Command[]) {
  return createTraceEmitter(
    { enqueue: (cmd) => commands.push(cmd) },
    {
      trace_id: "tr_test",
      job_id: "job_test",
      workflow_id: "wf_test",
    },
  );
}

describe("TracedLLMRuntime", () => {
  test("emits start and ok span events", async () => {
    const commands: Command[] = [];
    const inner: LLMRuntime = {
      async generateText() {
        return {
          text: "done",
          provider: "mock",
          model: "mock-1",
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        };
      },
    };
    const runtime = new TracedLLMRuntime(inner, makeTrace(commands));

    const tags = Array.from({ length: 20 }, (_, i) => `tag-${i}`);
    await runtime.generateText({ prompt: "hi", tags });

    expect(commands).toHaveLength(2);
    const start = commands[0];
    const end = commands[1];
    expect(start.type).toBe("trace.emit");
    expect(end.type).toBe("trace.emit");
    if (start.type !== "trace.emit" || end.type !== "trace.emit") return;
    expect(start.event.kind).toBe("llm.generate");
    expect(start.event.status).toBe("start");
    expect(getField<string[]>(getTraceData(start.event), "tags")).toHaveLength(
      12,
    );
    expect(end.event.status).toBe("ok");
    expect(getField<number>(getTraceData(end.event), "output_chars")).toBe(4);
  });

  test("emits error span event when inner throws", async () => {
    const commands: Command[] = [];
    const inner: LLMRuntime = {
      async generateText() {
        throw new Error("boom");
      },
    };
    const runtime = new TracedLLMRuntime(inner, makeTrace(commands));

    await expect(runtime.generateText({ prompt: "fail" })).rejects.toThrow(
      "boom",
    );

    expect(commands).toHaveLength(2);
    const end = commands[1];
    expect(end.type).toBe("trace.emit");
    if (end.type !== "trace.emit") return;
    expect(end.event.status).toBe("error");
    const error = getField<{ message: string; name?: string }>(
      getTraceData(end.event),
      "error",
    );
    expect(error.message).toBe("boom");
    expect(error.name).toBe("Error");
  });
});

describe("TracedEmbeddingRuntime", () => {
  test("emits start and ok span events", async () => {
    const commands: Command[] = [];
    const inner: EmbeddingRuntime = {
      async embedText(args) {
        return {
          vectors: args.texts.map(() => [0.1, 0.2]),
          provider: "mock",
          model: "mock-embed",
          dims: 2,
        };
      },
    };
    const runtime = new TracedEmbeddingRuntime(inner, makeTrace(commands));

    await runtime.embedText({ texts: ["one", "two"] });

    expect(commands).toHaveLength(2);
    const end = commands[1];
    expect(end.type).toBe("trace.emit");
    if (end.type !== "trace.emit") return;
    expect(end.event.kind).toBe("embeddings.generate");
    expect(end.event.status).toBe("ok");
    expect(getField<number>(getTraceData(end.event), "vectors")).toBe(2);
  });

  test("emits error span event when inner throws", async () => {
    const commands: Command[] = [];
    const inner: EmbeddingRuntime = {
      async embedText() {
        throw "nope";
      },
    };
    const runtime = new TracedEmbeddingRuntime(inner, makeTrace(commands));

    await expect(runtime.embedText({ texts: ["bad"] })).rejects.toBe("nope");

    expect(commands).toHaveLength(2);
    const end = commands[1];
    expect(end.type).toBe("trace.emit");
    if (end.type !== "trace.emit") return;
    expect(end.event.status).toBe("error");
    const error = getField<{ message: string }>(
      getTraceData(end.event),
      "error",
    );
    expect(error.message).toBe("nope");
  });
});

describe("TracedHarnessRuntime", () => {
  test("emits start and ok span events", async () => {
    const commands: Command[] = [];
    const inner: HarnessRuntime = {
      async runTask(args) {
        return {
          mode: args.mode ?? "propose",
          summary: "all good",
          outputs: [{ type: "text", content: "ok" }],
          provider: "mock",
        };
      },
    };
    const runtime = new TracedHarnessRuntime(inner, makeTrace(commands));

    await runtime.runTask({
      goal: "do it",
      cwd: "/tmp",
      mode: "plan",
      contextPaths: ["README.md"],
    });

    expect(commands).toHaveLength(2);
    const end = commands[1];
    expect(end.type).toBe("trace.emit");
    if (end.type !== "trace.emit") return;
    expect(end.event.kind).toBe("harness.run");
    expect(end.event.status).toBe("ok");
    expect(getField<number>(getTraceData(end.event), "outputs")).toBe(1);
  });

  test("emits error span event when inner throws", async () => {
    const commands: Command[] = [];
    const inner: HarnessRuntime = {
      async runTask() {
        throw new Error("no harness");
      },
    };
    const runtime = new TracedHarnessRuntime(inner, makeTrace(commands));

    await expect(
      runtime.runTask({ goal: "fail", cwd: "/tmp" }),
    ).rejects.toThrow("no harness");

    expect(commands).toHaveLength(2);
    const end = commands[1];
    expect(end.type).toBe("trace.emit");
    if (end.type !== "trace.emit") return;
    expect(end.event.status).toBe("error");
    const error = getField<{ message: string }>(
      getTraceData(end.event),
      "error",
    );
    expect(error.message).toBe("no harness");
  });
});
