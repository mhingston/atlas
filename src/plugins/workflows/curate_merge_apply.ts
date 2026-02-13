import type { Artifact } from "../../core/types";
import type { WorkflowPlugin } from "../types";

function getArtifactOrThrow(
  repo: { getArtifact(id: string): Artifact | null },
  id: string,
): Artifact {
  const artifact = repo.getArtifact(id);
  if (!artifact) {
    throw new Error(`Artifact not found: ${id}`);
  }
  return artifact;
}

/**
 * Reference workflow: curate.merge.apply.v1
 *
 * Applies a merge suggestion after explicit approval.
 */
export const curateMergeApplyWorkflow: WorkflowPlugin = {
  id: "curate.merge.apply.v1",

  async run(ctx, input, jobId) {
    const sourceIds = Array.isArray(input.sourceIds)
      ? input.sourceIds.map(String)
      : [];
    const title = input.title ? String(input.title) : "Canonical Note";
    const noteType = input.noteType
      ? String(input.noteType)
      : "note.canonical.v1";
    const summarize = input.summarize !== false;
    const summaryProfile =
      (input.summaryProfile as "fast" | "balanced" | "quality") ?? "balanced";
    const supersede = input.supersede === true;
    const indexEmbeddings = input.indexEmbeddings !== false;

    if (sourceIds.length === 0) {
      throw new Error("curate.merge.apply.v1 requires sourceIds");
    }

    const sources = sourceIds.map((id) => getArtifactOrThrow(ctx.repo, id));
    const sourceBlocks = sources.map((artifact) => {
      const header = artifact.title
        ? `${artifact.title} (${artifact.id})`
        : artifact.id;
      return `### ${header}\n${artifact.content_md ?? ""}`.trim();
    });

    let content = sourceBlocks.join("\n\n");
    let llmMeta: Record<string, unknown> | undefined;

    if (summarize) {
      const prompt = [
        "Create a canonical note from the sources below.",
        "Requirements:",
        "- Preserve important details and decisions",
        "- Resolve duplicates when possible",
        "- Use headings and bullets for scanability",
        "",
        sourceBlocks.join("\n\n"),
      ].join("\n");

      const result = await ctx.llm.generateText({
        prompt,
        temperature: 0.2,
        maxTokens: 700,
        profile: summaryProfile,
      });

      content = result.text;
      llmMeta = {
        llm_provider: result.provider,
        llm_usage: result.usage,
        summary_profile: summaryProfile,
      };
    }

    ctx.emitArtifact({
      type: noteType,
      job_id: jobId,
      title,
      content_md: content,
      data: {
        schema_version: "1",
        produced_by: "curate.merge.apply.v1",
        source_ids: sourceIds,
        ...llmMeta,
      },
    });

    if (supersede) {
      ctx.emitArtifact({
        type: "curation.supersedes.v1",
        job_id: jobId,
        title: "Curation: Superseded Sources",
        content_md: `Superseded sources: ${sourceIds.join(", ")}`,
        data: {
          schema_version: "1",
          produced_by: "curate.merge.apply.v1",
          source_ids: sourceIds,
          canonical_note: {
            type: noteType,
            title,
          },
        },
      });
    }

    if (indexEmbeddings) {
      const since = new Date(Date.now() - 60 * 1000).toISOString();
      ctx.spawnJob("index.embeddings.v1", {
        owner_type: "artifact",
        since,
        limit: 50,
      });
    }
  },
};
