import { logError, logInfo } from "../../core/logger";
import type { WorkflowPlugin } from "../types";

type Recommendation = "approve" | "changes_requested";

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated]`;
}

function parseRecommendation(text: string): Recommendation {
  const match = text.match(/RECOMMENDATION:\s*(approve|changes_requested)/i);
  if (!match) return "changes_requested";
  const value =
    match[1]?.toLowerCase() === "approve" ? "approve" : "changes_requested";
  return value;
}

/**
 * Reference workflow: code.review.v1
 *
 * Runs a harness task and then uses the LLM to review outputs.
 * Always creates a review artifact and defaults to needs_approval status.
 */
export const codeReviewWorkflow: WorkflowPlugin = {
  id: "code.review.v1",

  async run(ctx, input, jobId) {
    const goal = String(input.goal ?? "");
    const repoPath = String(input.repoPath ?? process.cwd());
    const mode = (input.mode as "plan" | "propose" | "apply") ?? "propose";
    const harnessId = String(input.harnessId ?? "default");
    const requireApproval = input.requireApproval !== false;
    const reviewProfile =
      (input.reviewProfile as "fast" | "balanced" | "quality") ?? "balanced";
    const maxDiffChars = Number.isFinite(Number(input.maxDiffChars))
      ? Math.max(2000, Number(input.maxDiffChars))
      : 12000;
    const maxLogChars = Number.isFinite(Number(input.maxLogChars))
      ? Math.max(2000, Number(input.maxLogChars))
      : 8000;

    if (!goal) {
      throw new Error("code.review.v1 requires 'goal' input");
    }

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

    logInfo("workflow.code_review.run", { goal, mode, harness_id: harnessId });

    let diffText = "";
    let planText = "";
    let runLogText = "";

    try {
      const result = await ctx.harness.runTask({
        harnessId,
        goal,
        cwd: repoPath,
        mode,
        budget: {
          maxMinutes: 10,
        },
      });

      ctx.emitArtifact({
        type: "code.summary.v1",
        job_id: jobId,
        title: `Code Review: ${goal}`,
        content_md: result.summary,
        data: {
          schema_version: "1",
          produced_by: "code.review.v1",
          harness_id: harnessId,
          mode: result.mode,
          goal,
        },
      });

      for (const output of result.outputs) {
        switch (output.type) {
          case "text":
            planText = output.content;
            ctx.emitArtifact({
              type: "code.plan.v1",
              job_id: jobId,
              title: output.title || "Plan",
              content_md: output.content,
              data: {
                schema_version: "1",
                produced_by: "code.review.v1",
                harness_id: harnessId,
              },
            });
            break;

          case "diff":
            diffText = output.diff;
            ctx.emitArtifact({
              type: "code.patch.v1",
              job_id: jobId,
              title: output.title || "Patch",
              content_md: `\`\`\`diff\n${output.diff}\n\`\`\``,
              data: {
                schema_version: "1",
                produced_by: "code.review.v1",
                harness_id: harnessId,
                diff: output.diff,
              },
            });
            break;

          case "command_log":
            runLogText = output.entries
              .map(
                (e) =>
                  `$ ${e.cmd}\nExit: ${e.exitCode ?? "?"}\n${e.out || ""}${e.err || ""}`,
              )
              .join("\n\n");
            ctx.emitArtifact({
              type: "code.runlog.v1",
              job_id: jobId,
              title: "Command Log",
              content_md: runLogText,
              data: {
                schema_version: "1",
                produced_by: "code.review.v1",
                harness_id: harnessId,
                entries: output.entries,
              },
            });
            break;

          case "file":
            ctx.emitArtifact({
              type: "code.file.v1",
              job_id: jobId,
              title: output.path,
              content_md: `\`\`\`\n${output.content}\n\`\`\``,
              data: {
                schema_version: "1",
                produced_by: "code.review.v1",
                harness_id: harnessId,
                path: output.path,
                content: output.content,
              },
            });
            break;
        }
      }

      const reviewPrompt = [
        `Goal: ${goal}`,
        `Mode: ${mode}`,
        `Repository: ${repoPath}`,
        "",
        "Plan:",
        planText ? truncate(planText, 4000) : "No plan output.",
        "",
        "Diff:",
        diffText ? truncate(diffText, maxDiffChars) : "No diff output.",
        "",
        "Command Log:",
        runLogText ? truncate(runLogText, maxLogChars) : "No command log.",
        "",
        "Provide:",
        "1) Summary of changes",
        "2) Risks or regressions",
        "3) Required checks/tests",
        "4) Clear recommendation line formatted exactly as:",
        "RECOMMENDATION: approve | changes_requested",
      ].join("\n");

      const reviewResult = await ctx.llm.generateText({
        system:
          "You are a strict code reviewer. Be concise, concrete, and risk-aware.",
        prompt: reviewPrompt,
        temperature: 0.2,
        maxTokens: 800,
        profile: reviewProfile,
      });

      const recommendation = parseRecommendation(reviewResult.text);

      ctx.emitArtifact({
        type: "code.review.v1",
        job_id: jobId,
        title: `Review: ${goal}`,
        content_md: reviewResult.text,
        data: {
          schema_version: "1",
          produced_by: "code.review.v1",
          harness_id: harnessId,
          mode,
          goal,
          recommendation,
          require_approval: requireApproval,
          llm_provider: reviewResult.provider,
          llm_usage: reviewResult.usage,
        },
      });

      if (requireApproval) {
        ctx.commands.enqueue({
          type: "job.updateStatus",
          id: jobId,
          status: "needs_approval",
        });
      } else {
        ctx.commands.enqueue({
          type: "job.updateStatus",
          id: jobId,
          status: recommendation === "approve" ? "succeeded" : "failed",
        });
      }

      logInfo("workflow.code_review.complete", { recommendation });
    } catch (error) {
      logError("workflow.code_review.failed", { error });

      ctx.emitArtifact({
        type: "code.error.v1",
        job_id: jobId,
        title: "Code Review Failed",
        content_md: `Error: ${error instanceof Error ? error.message : String(error)}`,
        data: {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          goal,
        },
      });

      throw error;
    }
  },
};
