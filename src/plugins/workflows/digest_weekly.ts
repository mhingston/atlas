import { cosineSimilarity, normalizeVector } from "../../ai/embedding_runtime";
import type { WorkflowPlugin } from "../types";

type OwnerType = "artifact" | "entity";

function cleanSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...[truncated]`;
}

function buildSince(daysBack: number): string {
  const ms = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

/**
 * Reference workflow: digest.weekly.v1
 *
 * Uses embeddings to retrieve recent artifacts/entities and produces a synthesis.
 */
export const digestWeeklyWorkflow: WorkflowPlugin = {
  id: "digest.weekly.v1",

  async run(ctx, input, jobId) {
    const query = String(input.query ?? input.topic ?? "weekly highlights");
    const ownerType = (input.owner_type as OwnerType) ?? "artifact";
    const k = Math.min(Math.max(Number(input.k ?? 10), 1), 50);
    const limit = Math.min(Math.max(Number(input.limit ?? 200), k), 2000);
    const since = String(input.since ?? buildSince(7));
    const profile =
      (input.profile as "fast" | "balanced" | "quality") ?? "balanced";
    const maxItemChars = Math.min(
      Math.max(Number(input.max_item_chars ?? 800), 200),
      2000,
    );

    if (!ctx.embeddings) {
      ctx.emitArtifact({
        type: "digest.error.v1",
        job_id: jobId,
        title: "Embeddings Not Available",
        content_md:
          "Embedding runtime is not configured. Set an embeddings provider to enable digests.",
        data: {
          error: "embeddings_not_available",
          query,
        },
      });
      return;
    }

    const allCandidates = ctx.repo.listEmbeddings({
      owner_type: ownerType,
      since,
      limit,
    });
    if (allCandidates.length === 0) {
      ctx.emitArtifact({
        type: "digest.weekly.v1",
        job_id: jobId,
        title: `Digest: ${query}`,
        content_md: "No embeddings found for the selected window.",
        data: {
          schema_version: "1",
          produced_by: "digest.weekly.v1",
          query,
          owner_type: ownerType,
          since,
          total_candidates: 0,
          returned: 0,
        },
      });
      return;
    }

    const queryEmbed = await ctx.embeddings.embedText({
      texts: [query],
      profile,
    });
    const queryVector = normalizeVector(queryEmbed.vectors[0] ?? []);
    if (queryVector.length === 0) {
      ctx.emitArtifact({
        type: "digest.error.v1",
        job_id: jobId,
        title: "Embedding Failed",
        content_md: "Failed to embed the query for digest.",
        data: {
          error: "embed_failed",
          query,
        },
      });
      return;
    }

    const candidates = allCandidates.filter(
      (emb) => emb.dims === queryVector.length,
    );
    const scored = candidates.map((emb) => ({
      embedding: emb,
      score: cosineSimilarity(queryVector, emb.vector),
    }));
    scored.sort((a, b) => b.score - a.score);
    const topK = scored.slice(0, k);

    const items = topK
      .map(({ embedding, score }) => {
        if (embedding.owner_type === "artifact") {
          const artifact = ctx.repo.getArtifact(embedding.owner_id);
          if (!artifact) return null;
          return {
            id: artifact.id,
            type: artifact.type,
            title: artifact.title ?? artifact.type,
            content: artifact.content_md ?? "",
            created_at: artifact.created_at,
            score,
          };
        }
        const entity = ctx.repo.getEntity(embedding.owner_id);
        if (!entity) return null;
        return {
          id: entity.id,
          type: entity.type,
          title: entity.title ?? entity.type,
          content: entity.url ?? "",
          created_at: entity.updated_at,
          score,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (items.length === 0) {
      ctx.emitArtifact({
        type: "digest.weekly.v1",
        job_id: jobId,
        title: `Digest: ${query}`,
        content_md: "No matching items found after filtering.",
        data: {
          schema_version: "1",
          produced_by: "digest.weekly.v1",
          query,
          owner_type: ownerType,
          since,
          total_candidates: allCandidates.length,
          returned: 0,
        },
      });
      return;
    }

    const context = items
      .map((item) => {
        const snippet = truncate(cleanSnippet(item.content), maxItemChars);
        return [
          `[${item.id}] ${item.title}`,
          `Type: ${item.type}`,
          `Created: ${item.created_at}`,
          `Score: ${item.score.toFixed(3)}`,
          snippet ? `Content: ${snippet}` : "Content: (empty)",
        ].join("\n");
      })
      .join("\n\n");

    const prompt = [
      `Query: ${query}`,
      `Window since: ${since}`,
      "",
      "Items:",
      context,
      "",
      "Write a digest that includes:",
      "1) Themes and patterns",
      "2) Key insights",
      "3) Suggested follow-ups",
      "Use inline references like [artifact_id] to cite items.",
    ].join("\n");

    const result = await ctx.llm.generateText({
      system:
        "You are a careful synthesizer. Prefer concrete, sourced insights over speculation.",
      prompt,
      temperature: 0.3,
      maxTokens: 1200,
    });

    ctx.emitArtifact({
      type: "digest.weekly.v1",
      job_id: jobId,
      title: `Digest: ${query}`,
      content_md: result.text,
      data: {
        schema_version: "1",
        produced_by: "digest.weekly.v1",
        query,
        owner_type: ownerType,
        since,
        selected_ids: items.map((i) => i.id),
        total_candidates: allCandidates.length,
        returned: items.length,
        llm_provider: result.provider,
        llm_usage: result.usage,
      },
    });
  },
};
