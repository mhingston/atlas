import type { createTraceEmitter } from "../core/trace";
import type { HarnessRunArgs, HarnessRunResult, HarnessRuntime } from "./types";

function errorSummary(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }
  return { message: String(error) };
}

export class TracedHarnessRuntime implements HarnessRuntime {
  constructor(
    private inner: HarnessRuntime,
    private trace: ReturnType<typeof createTraceEmitter>,
  ) {}

  async runTask(args: HarnessRunArgs): Promise<HarnessRunResult> {
    const span = this.trace.startSpan(
      "harness.run",
      {
        harness_id: args.harnessId ?? null,
        mode: args.mode ?? "propose",
        profile: args.profile ?? "balanced",
        cwd: args.cwd,
        goal_chars: args.goal?.length ?? 0,
        context_paths: args.contextPaths?.length ?? 0,
      },
      "Harness task",
    );

    try {
      const result = await this.inner.runTask(args);
      this.trace.endSpan(span, "ok", {
        provider: result.provider ?? null,
        outputs: result.outputs.length,
        output_types: result.outputs.map((o) => o.type),
        summary_chars: result.summary?.length ?? 0,
      });
      return result;
    } catch (error) {
      this.trace.endSpan(
        span,
        "error",
        { error: errorSummary(error) },
        "Harness task failed",
      );
      throw error;
    }
  }
}
