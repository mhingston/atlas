import { logError, logInfo } from "../../core/logger";
import type { WorkflowPlugin } from "../types";

/**
 * Reference workflow: code.assist.v1
 *
 * Uses HarnessRuntime to execute agent-driven code tasks.
 * Produces artifacts from harness outputs (plans, patches, logs).
 *
 * Defaults to "propose" mode - never auto-applies changes.
 */
export const codeAssistWorkflow: WorkflowPlugin = {
  id: "code.assist.v1",

  async run(ctx, input, jobId) {
    const goal = String(input.goal ?? "");
    const repoPath = String(input.repoPath ?? process.cwd());
    const mode = (input.mode as "plan" | "propose" | "apply") ?? "propose";
    const harnessId = String(input.harnessId ?? "default");

    if (!goal) {
      throw new Error("code.assist.v1 requires 'goal' input");
    }

    // Check if harness is available
    if (!ctx.harness) {
      ctx.emitArtifact({
        type: "code.error.v1",
        job_id: jobId,
        title: "Harness Not Available",
        content_md:
          "Harness runtime is not configured. Set ATLAS_HARNESS_ENABLED=true to enable.",
        data: {
          error: "harness_not_available",
          goal,
        },
      });
      return;
    }

    logInfo("workflow.code_assist.run", { goal, mode, harness_id: harnessId });

    try {
      // Execute harness task
      const result = await ctx.harness.runTask({
        harnessId,
        goal,
        cwd: repoPath,
        mode,
        budget: {
          maxMinutes: 10,
        },
      });

      // Emit summary artifact
      ctx.emitArtifact({
        type: "code.summary.v1",
        job_id: jobId,
        title: `Code Assist: ${goal}`,
        content_md: result.summary,
        data: {
          schema_version: "1",
          produced_by: "code.assist.v1",
          harness_id: harnessId,
          mode: result.mode,
          goal,
        },
      });

      // Process outputs and emit appropriate artifacts
      for (const output of result.outputs) {
        switch (output.type) {
          case "text":
            ctx.emitArtifact({
              type: "code.plan.v1",
              job_id: jobId,
              title: output.title || "Plan",
              content_md: output.content,
              data: {
                schema_version: "1",
                produced_by: "code.assist.v1",
                harness_id: harnessId,
              },
            });
            break;

          case "diff":
            ctx.emitArtifact({
              type: "code.patch.v1",
              job_id: jobId,
              title: output.title || "Patch",
              content_md: `\`\`\`diff\n${output.diff}\n\`\`\``,
              data: {
                schema_version: "1",
                produced_by: "code.assist.v1",
                harness_id: harnessId,
                diff: output.diff,
              },
            });
            break;

          case "command_log":
            ctx.emitArtifact({
              type: "code.runlog.v1",
              job_id: jobId,
              title: "Command Log",
              content_md: output.entries
                .map(
                  (e) =>
                    `$ ${e.cmd}\nExit: ${e.exitCode ?? "?"}\n${e.out || ""}${e.err || ""}`,
                )
                .join("\n\n"),
              data: {
                schema_version: "1",
                produced_by: "code.assist.v1",
                harness_id: harnessId,
                entries: output.entries,
              },
            });
            break;

          case "file":
            // Emit file content as artifact
            ctx.emitArtifact({
              type: "code.file.v1",
              job_id: jobId,
              title: output.path,
              content_md: `\`\`\`\n${output.content}\n\`\`\``,
              data: {
                schema_version: "1",
                produced_by: "code.assist.v1",
                harness_id: harnessId,
                path: output.path,
                content: output.content,
              },
            });
            break;
        }
      }

      logInfo("workflow.code_assist.complete", {
        outputs: result.outputs.length,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logError("workflow.code_assist.failed", { error });

      ctx.emitArtifact({
        type: "code.error.v1",
        job_id: jobId,
        title: "Code Assist Failed",
        content_md: `Error: ${errorMessage}`,
        data: {
          error: errorMessage,
          stack: errorStack,
          goal,
        },
      });

      throw error;
    }
  },
};
