import type { WorkflowPlugin } from "../types";
import { generateScratchpad } from "./scratchpad";

type ReviewProfile = "fast" | "balanced" | "quality";

/**
 * Reference workflow: scratchpad.review.v1
 *
 * Generates a scratchpad plus a decision note and requires approval by default.
 */
export const scratchpadReviewWorkflow: WorkflowPlugin = {
  id: "scratchpad.review.v1",

  async run(ctx, input, jobId) {
    const requireApproval = input.requireApproval !== false;
    const reviewProfile = (input.reviewProfile as ReviewProfile) ?? "balanced";

    const scratchpad = await generateScratchpad(ctx, input);

    ctx.emitArtifact({
      type: "scratchpad.session.v1",
      job_id: jobId,
      title: scratchpad.title,
      content_md: scratchpad.text,
      data: {
        schema_version: "1",
        produced_by: "scratchpad.review.v1",
        intent: scratchpad.intent,
        topic: scratchpad.topic,
        query: scratchpad.query,
        owner_type: scratchpad.ownerType,
        since: scratchpad.since,
        selected_ids: scratchpad.selectedIds,
        llm_provider: scratchpad.llmProvider,
        llm_usage: scratchpad.llmUsage,
      },
    });

    const decisionPrompt = [
      "You are producing a decision note from a scratchpad.",
      "Requirements:",
      "- State a clear decision or recommendation",
      "- Provide rationale",
      "- Call out risks or uncertainties",
      "- List next steps",
      "- Cite context with inline references like [artifact_id]",
      "",
      "Scratchpad:",
      scratchpad.text,
    ].join("\n");

    const review = await ctx.llm.generateText({
      system:
        "Be concise and concrete. If information is missing, say so explicitly.",
      prompt: decisionPrompt,
      temperature: 0.2,
      maxTokens: 800,
      profile: reviewProfile,
    });

    ctx.emitArtifact({
      type: "scratchpad.review.v1",
      job_id: jobId,
      title: scratchpad.topic
        ? `Decision Note: ${scratchpad.topic}`
        : "Decision Note",
      content_md: review.text,
      data: {
        schema_version: "1",
        produced_by: "scratchpad.review.v1",
        intent: scratchpad.intent,
        topic: scratchpad.topic,
        query: scratchpad.query,
        owner_type: scratchpad.ownerType,
        since: scratchpad.since,
        selected_ids: scratchpad.selectedIds,
        llm_provider: review.provider,
        llm_usage: review.usage,
        review_profile: reviewProfile,
        require_approval: requireApproval,
      },
    });

    ctx.commands.enqueue({
      type: "job.updateStatus",
      id: jobId,
      status: requireApproval ? "needs_approval" : "succeeded",
    });
  },
};
