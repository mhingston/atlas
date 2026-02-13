import { createHash } from "node:crypto";
import { logError } from "../../core/logger";
import type { WorkflowContext } from "../types";
import type { WorkflowPlugin } from "../types";

/**
 * Index Embeddings Workflow
 *
 * Iterates through artifacts, generates embeddings for their content,
 * and stores them for semantic search.
 */
export async function runIndexEmbeddings(
  ctx: WorkflowContext,
  input: {
    since?: string;
    limit?: number;
    owner_type?: "artifact" | "entity";
    entity_type?: string;
    entity_source?: string;
  },
  jobId: string,
) {
  const limit = input.limit ?? 100;
  const since = input.since;
  const owner_type = input.owner_type ?? "artifact";
  const dateFilter = since ? (iso: string) => iso > since : undefined;
  const entityType = input.entity_type ? String(input.entity_type) : undefined;
  const entitySource = input.entity_source
    ? String(input.entity_source)
    : undefined;

  // Use embedding runtime from context (provided by runner)
  if (!ctx.embeddings) {
    throw new Error("Embedding runtime not available in context");
  }

  let processed = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  if (owner_type === "artifact") {
    const artifacts = ctx.findArtifacts({ since, limit });

    for (const artifact of artifacts) {
      try {
        processed++;

        const contentToEmbed = `${artifact.title ?? ""} ${artifact.content_md ?? ""}`;
        const contentHash = createHash("sha256")
          .update(contentToEmbed)
          .digest("hex");

        const existingEmbeddings = ctx.repo.getEmbeddingsByOwner(
          "artifact",
          artifact.id,
        );
        const existing = existingEmbeddings[0];

        if (existing && existing.content_hash === contentHash) {
          skipped++;
          continue;
        }

        const embedResult = await ctx.embeddings.embedText({
          texts: [contentToEmbed],
          profile: "balanced",
        });

        const embeddingId = `emb_${owner_type}_${artifact.id}`;
        const now = new Date().toISOString();

        ctx.commands.enqueue({
          type: "embedding.upsert",
          data: {
            id: embeddingId,
            owner_type: "artifact",
            owner_id: artifact.id,
            provider: embedResult.provider,
            model: embedResult.model ?? "unknown",
            dims: embedResult.dims,
            vector: embedResult.vectors[0] ?? [],
            content_hash: contentHash,
            created_at: existing?.created_at ?? now,
            updated_at: now,
          },
        });

        if (existing) {
          updated++;
        } else {
          created++;
        }
      } catch (error) {
        logError("workflow.index_embeddings.failed", {
          artifact_id: artifact.id,
          error,
        });
        failed++;
      }
    }
  }

  if (owner_type === "entity") {
    let entities = ctx.repo.listEntities({
      type: entityType,
      source: entitySource,
      limit,
    });
    if (dateFilter) {
      entities = entities.filter((entity) => dateFilter(entity.updated_at));
    }

    for (const entity of entities) {
      try {
        if (entity.status && entity.status !== "active") {
          skipped++;
          continue;
        }
        processed++;

        const content = String(entity.data?.content ?? "");
        const contentToEmbed = `${entity.title ?? ""} ${entity.url ?? ""} ${content}`;
        const contentHash = createHash("sha256")
          .update(contentToEmbed)
          .digest("hex");

        const existingEmbeddings = ctx.repo.getEmbeddingsByOwner(
          "entity",
          entity.id,
        );
        const existing = existingEmbeddings[0];

        if (existing && existing.content_hash === contentHash) {
          skipped++;
          continue;
        }

        const embedResult = await ctx.embeddings.embedText({
          texts: [contentToEmbed],
          profile: "balanced",
        });

        const embeddingId = `emb_${owner_type}_${entity.id}`;
        const now = new Date().toISOString();

        ctx.commands.enqueue({
          type: "embedding.upsert",
          data: {
            id: embeddingId,
            owner_type: "entity",
            owner_id: entity.id,
            provider: embedResult.provider,
            model: embedResult.model ?? "unknown",
            dims: embedResult.dims,
            vector: embedResult.vectors[0] ?? [],
            content_hash: contentHash,
            created_at: existing?.created_at ?? now,
            updated_at: now,
          },
        });

        if (existing) {
          updated++;
        } else {
          created++;
        }
      } catch (error) {
        logError("workflow.index_embeddings.failed", {
          entity_id: entity.id,
          error,
        });
        failed++;
      }
    }
  }

  // Emit report artifact
  ctx.emitArtifact({
    type: "index.embeddings.report.v1",
    job_id: jobId,
    title: "Embeddings Index Report",
    content_md: `# Embeddings Index Report

- **Owner Type**: ${owner_type}
- **Processed**: ${processed}
- **Created**: ${created}
- **Updated**: ${updated}
- **Skipped** (unchanged): ${skipped}
- **Failed**: ${failed}
`,
    data: {
      schema_version: "1.0",
      produced_by: "index.embeddings.v1",
      owner_type,
      entity_type: entityType ?? null,
      entity_source: entitySource ?? null,
      processed,
      created,
      updated,
      skipped,
      failed,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Workflow plugin registration
 */
export const indexEmbeddingsWorkflow: WorkflowPlugin = {
  id: "index.embeddings.v1",
  run: runIndexEmbeddings,
};
