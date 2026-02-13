import { logInfo } from "../../core/logger";
import type { WorkflowPlugin } from "../types";

/**
 * Reference workflow: brainstorm.v1
 *
 * Reads entities (e.g. bookmarks) and produces a brainstorm session artifact.
 * Works with mock LLM provider out of the box, uses real provider if configured.
 */
export const brainstormWorkflow: WorkflowPlugin = {
  id: "brainstorm.v1",

  async run(ctx, input, jobId) {
    const topic = String(input.topic ?? "brainstorm");
    const constraints = Array.isArray(input.constraints)
      ? input.constraints.map(String)
      : [];

    // Pull relevant bookmarks as context
    const bookmarks = ctx.repo.listEntities({
      type: "raindrop.bookmark",
      limit: 50,
    });

    // Build prompt for LLM
    const prompt = [
      `Generate a brainstorm session for the topic: "${topic}"`,
      "",
      constraints.length > 0
        ? `Constraints:\n${constraints.map((c) => `- ${c}`).join("\n")}`
        : "",
      "",
      bookmarks.length > 0
        ? `Context (sample bookmarks):\n${bookmarks
            .slice(0, 10)
            .map((b) => `- ${b.title ?? b.id} (${b.url ?? "no url"})`)
            .join("\n")}`
        : "",
      "",
      "Please provide:",
      "1. An overview of the brainstorm session",
      "2. Key ideas generated",
      "3. Next steps to explore",
    ]
      .filter(Boolean)
      .join("\n");

    // Call LLM
    const result = await ctx.llm.generateText({
      system:
        "You are a helpful brainstorming assistant. Generate creative ideas and actionable next steps.",
      prompt,
      temperature: 0.7,
      maxTokens: 1000,
    });

    // Emit session artifact
    ctx.emitArtifact({
      type: "brainstorm.session.v1",
      job_id: jobId,
      title: `Brainstorm session: ${topic}`,
      content_md: result.text,
      data: {
        schema_version: "1",
        produced_by: "brainstorm.v1",
        inputs: {
          entities: bookmarks.slice(0, 10).map((b) => b.id),
          artifacts: [],
        },
        tags: ["brainstorm", `topic:${topic}`],
        llm_usage: result.usage,
        llm_provider: result.provider,
      },
    });

    logInfo("workflow.brainstorm.complete", {
      topic,
      provider: result.provider,
    });
  },
};
