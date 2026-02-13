import type { Artifact } from "../../core/types";
import type { WorkflowPlugin } from "../types";

type CurateAction = "promote" | "merge" | "tag" | "dedupe" | "reconcile";

type CurateInput = {
  action?: CurateAction;
  sourceIds?: string[];
  targetId?: string;
  title?: string;
  tags?: string[];
  noteType?: string;
  summarize?: boolean;
  summaryProfile?: "fast" | "balanced" | "quality";
  indexEmbeddings?: boolean;
  supersede?: boolean;
  typeFilter?: string;
  since?: string;
  limit?: number;
  dedupeMode?: "title" | "embedding";
  similarityThreshold?: number;
  suggestMerge?: boolean;
  maxSuggestions?: number;
  minGroupSize?: number;
  maxCandidates?: number;
  maxGroups?: number;
  dedupeCursor?: string;
  dedupeBatchSize?: number;
  dedupeWindowSize?: number;
  dedupeWindowOverlap?: number;
  emitGroupArtifacts?: boolean;
  reconcilePolicy?: {
    prefer?: "latest" | "earliest" | "longest" | "shortest" | "source";
    sourcePriority?: string[];
    requireCitations?: boolean;
    allowUnresolved?: boolean;
  };
};

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function chunkWindows<T>(items: T[], size: number, overlap: number): T[][] {
  const windows: T[][] = [];
  const step = Math.max(1, size - overlap);
  for (let i = 0; i < items.length; i += step) {
    windows.push(items.slice(i, i + size));
    if (i + size >= items.length) break;
  }
  return windows;
}

function formatPolicy(policy?: CurateInput["reconcilePolicy"]): string {
  if (!policy) return "None";
  const parts: string[] = [];
  if (policy.prefer) parts.push(`Prefer: ${policy.prefer}`);
  if (policy.sourcePriority?.length)
    parts.push(`Source priority: ${policy.sourcePriority.join(" > ")}`);
  if (policy.requireCitations) parts.push("Require citations: yes");
  if (policy.allowUnresolved === false)
    parts.push("Allow unresolved conflicts: no");
  return parts.length ? parts.join(" | ") : "None";
}

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
 * Reference workflow: curate.artifacts.v1
 *
 * Curation loop for long-lived memory:
 * - promote: create a canonical note from one or more artifacts
 * - merge: merge multiple artifacts into a canonical note
 * - tag: apply tags to existing artifacts
 */
export const curateArtifactsWorkflow: WorkflowPlugin = {
  id: "curate.artifacts.v1",

  async run(ctx, input, jobId) {
    const action = (input.action as CurateAction) ?? "promote";
    const sourceIds = Array.isArray(input.sourceIds)
      ? input.sourceIds.map(String)
      : [];
    const targetId = input.targetId ? String(input.targetId) : undefined;
    const title = input.title ? String(input.title) : undefined;
    const tags = Array.isArray(input.tags)
      ? uniqueStrings(input.tags.map(String))
      : [];
    const noteType = input.noteType
      ? String(input.noteType)
      : "note.canonical.v1";
    const summarize = input.summarize !== false;
    const summaryProfile =
      (input.summaryProfile as "fast" | "balanced" | "quality") ?? "balanced";
    const indexEmbeddings = input.indexEmbeddings !== false;
    const supersede = input.supersede === true;
    const typeFilter = input.typeFilter ? String(input.typeFilter) : undefined;
    const since = input.since ? String(input.since) : undefined;
    const limit = Number.isFinite(Number(input.limit))
      ? Math.max(1, Number(input.limit))
      : undefined;
    const dedupeMode = (input.dedupeMode as "title" | "embedding") ?? "title";
    const similarityThreshold = Number.isFinite(
      Number(input.similarityThreshold),
    )
      ? Math.min(0.99, Math.max(0.5, Number(input.similarityThreshold)))
      : 0.9;
    const suggestMerge = input.suggestMerge === true;
    const maxSuggestions = Number.isFinite(Number(input.maxSuggestions))
      ? Math.max(1, Number(input.maxSuggestions))
      : 3;
    const minGroupSize = Number.isFinite(Number(input.minGroupSize))
      ? Math.max(2, Number(input.minGroupSize))
      : 2;
    const maxCandidates = Number.isFinite(Number(input.maxCandidates))
      ? Math.max(minGroupSize, Number(input.maxCandidates))
      : 500;
    const maxGroups = Number.isFinite(Number(input.maxGroups))
      ? Math.max(1, Number(input.maxGroups))
      : 20;
    const dedupeWindowSize = Number.isFinite(Number(input.dedupeWindowSize))
      ? Math.max(minGroupSize, Number(input.dedupeWindowSize))
      : 200;
    const dedupeWindowOverlap = Number.isFinite(
      Number(input.dedupeWindowOverlap),
    )
      ? Math.max(0, Number(input.dedupeWindowOverlap))
      : 50;
    const emitGroupArtifacts = input.emitGroupArtifacts !== false;
    const reconcilePolicy = input.reconcilePolicy;
    const dedupeCursor = input.dedupeCursor
      ? String(input.dedupeCursor)
      : undefined;
    const dedupeBatchSize = Number.isFinite(Number(input.dedupeBatchSize))
      ? Math.max(minGroupSize, Number(input.dedupeBatchSize))
      : undefined;

    if (action === "tag") {
      const ids = targetId ? [targetId] : sourceIds;
      if (ids.length === 0) {
        throw new Error(
          "curate.artifacts.v1 tag action requires targetId or sourceIds",
        );
      }
      if (tags.length === 0) {
        throw new Error("curate.artifacts.v1 tag action requires tags");
      }

      for (const id of ids) {
        const artifact = getArtifactOrThrow(ctx.repo, id);
        const existingTags = Array.isArray(artifact.data.tags)
          ? artifact.data.tags.map(String)
          : [];
        const nextTags = uniqueStrings([...existingTags, ...tags]);
        ctx.commands.enqueue({
          type: "artifact.update",
          id: artifact.id,
          patch: {
            data: {
              ...artifact.data,
              tags: nextTags,
            },
          },
        });
      }

      ctx.emitArtifact({
        type: "curation.tagged.v1",
        job_id: jobId,
        title: "Curation: Tags Applied",
        content_md: `Applied tags to ${ids.length} artifact(s): ${tags.join(", ")}`,
        data: {
          schema_version: "1",
          produced_by: "curate.artifacts.v1",
          action,
          tags,
          targets: ids,
        },
      });

      return;
    }

    if (action === "dedupe") {
      const cursorArtifact =
        dedupeCursor && sourceIds.length === 0
          ? ctx.repo.getArtifact(dedupeCursor)
          : null;
      if (dedupeCursor && sourceIds.length === 0 && !cursorArtifact) {
        throw new Error(
          `curate.artifacts.v1 dedupe cursor not found: ${dedupeCursor}`,
        );
      }
      const requestedBatchSize =
        dedupeBatchSize ??
        (Number.isFinite(Number(limit))
          ? Math.max(minGroupSize, Number(limit))
          : maxCandidates);
      const batchSize = Math.min(requestedBatchSize, maxCandidates);
      const fetchLimit = Math.min(batchSize + 1, maxCandidates);
      const candidates =
        sourceIds.length > 0
          ? sourceIds.map((id) => getArtifactOrThrow(ctx.repo, id))
          : ctx.findArtifacts({
              type: typeFilter,
              since,
              before: cursorArtifact?.created_at,
              beforeId: cursorArtifact?.id,
              limit: fetchLimit,
            });

      const hasMore = candidates.length > batchSize;
      const candidateList = candidates.slice(0, batchSize);
      const nextCursor =
        hasMore && candidateList.length > 0
          ? candidateList[candidateList.length - 1]?.id
          : undefined;

      if (candidateList.length === 0) {
        throw new Error(
          "curate.artifacts.v1 dedupe action found no candidates",
        );
      }

      let duplicateGroups: Artifact[][] = [];
      let dedupeSummary = "";
      const candidateCount = candidateList.length;
      let candidateWithEmbeddings = 0;
      let windowCount = 1;

      if (dedupeMode === "embedding") {
        const { cosineSimilarity } = await import("../../ai/embedding_runtime");
        const vectors = new Map<string, number[]>();

        for (const artifact of candidateList) {
          const embeddings = ctx.repo.getEmbeddingsByOwner(
            "artifact",
            artifact.id,
          );
          const latest = embeddings[0];
          if (latest?.vector?.length) {
            vectors.set(artifact.id, latest.vector);
          }
        }

        candidateWithEmbeddings = vectors.size;
        const ordered = candidateList
          .filter((artifact) => vectors.has(artifact.id))
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        const windows = chunkWindows(
          ordered,
          dedupeWindowSize,
          dedupeWindowOverlap,
        );
        windowCount = windows.length;

        const visited = new Set<string>();
        for (const window of windows) {
          for (const artifact of window) {
            if (visited.has(artifact.id)) continue;
            const seedVector = vectors.get(artifact.id);
            if (!seedVector) continue;

            const group: Artifact[] = [artifact];
            visited.add(artifact.id);

            for (const other of window) {
              if (visited.has(other.id)) continue;
              const otherVector = vectors.get(other.id);
              if (!otherVector) continue;

              const score = cosineSimilarity(seedVector, otherVector);
              if (score >= similarityThreshold) {
                group.push(other);
                visited.add(other.id);
              }
            }

            if (group.length >= minGroupSize) {
              duplicateGroups.push(group);
            }
          }
        }

        dedupeSummary = `Embedding similarity threshold: ${similarityThreshold} (windowed, size ${dedupeWindowSize}, overlap ${dedupeWindowOverlap})`;
      } else {
        const groups = new Map<string, Artifact[]>();
        for (const artifact of candidateList) {
          const basis = artifact.title ?? artifact.content_md ?? artifact.id;
          const key = normalizeKey(basis);
          if (!groups.has(key)) {
            groups.set(key, []);
          }
          groups.get(key)?.push(artifact);
        }

        duplicateGroups = Array.from(groups.values()).filter(
          (group) => group.length >= minGroupSize,
        );
        dedupeSummary = "Title/content heuristic grouping";
      }

      const duplicates = duplicateGroups.slice(0, maxGroups);
      const droppedGroups = Math.max(
        0,
        duplicateGroups.length - duplicates.length,
      );

      ctx.emitArtifact({
        type: "curation.dedupe.v1",
        job_id: jobId,
        title: "Curation: Dedupe Candidates",
        content_md: duplicates.length
          ? duplicates
              .map((group, idx) => {
                const titles = group.map((a) => a.title ?? a.id).join(", ");
                return `### Group ${idx + 1}\n${titles}`;
              })
              .join("\n\n")
          : "No duplicate groups found.",
        data: {
          schema_version: "1",
          produced_by: "curate.artifacts.v1",
          action,
          dedupe_mode: dedupeMode,
          similarity_threshold:
            dedupeMode === "embedding" ? similarityThreshold : undefined,
          min_group_size: minGroupSize,
          batch_size: batchSize,
          cursor: dedupeCursor ?? null,
          next_cursor: nextCursor ?? null,
          has_more: hasMore,
          total_candidates: candidateCount,
          candidates_with_embeddings:
            dedupeMode === "embedding" ? candidateWithEmbeddings : undefined,
          windowed: dedupeMode === "embedding",
          windows: dedupeMode === "embedding" ? windowCount : undefined,
          duplicate_groups: duplicates.map((group) => group.map((a) => a.id)),
          dropped_groups: droppedGroups > 0 ? droppedGroups : undefined,
          summary: dedupeSummary,
        },
      });

      if (emitGroupArtifacts && duplicates.length > 0) {
        duplicates.forEach((group, idx) => {
          const titles = group.map((a) => a.title ?? a.id).join(", ");
          ctx.emitArtifact({
            type: "curation.dedupe.group.v1",
            job_id: jobId,
            title: `Dedupe Group ${idx + 1}`,
            content_md: titles,
            data: {
              schema_version: "1",
              produced_by: "curate.artifacts.v1",
              action: "dedupe",
              group_index: idx + 1,
              source_ids: group.map((a) => a.id),
            },
          });
        });
      }

      if (suggestMerge && duplicates.length > 0) {
        const suggestions = duplicates.slice(0, maxSuggestions);
        let suggestionIndex = 0;

        for (const group of suggestions) {
          suggestionIndex += 1;
          const sourceBlocks = group.map((artifact) => {
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

          const canonicalTitle =
            title ?? `Canonical Suggestion ${suggestionIndex}`;

          ctx.emitArtifact({
            type: "curation.merge.suggestion.v1",
            job_id: jobId,
            title: canonicalTitle,
            content_md: content,
            data: {
              schema_version: "1",
              produced_by: "curate.artifacts.v1",
              action: "dedupe",
              suggestion: true,
              source_ids: group.map((a) => a.id),
              dedupe_mode: dedupeMode,
              similarity_threshold:
                dedupeMode === "embedding" ? similarityThreshold : undefined,
              ...llmMeta,
            },
          });

          ctx.emitArtifact({
            type: "checkpoint.approval_request.v1",
            job_id: jobId,
            title: "Approval Required: Merge Suggestion",
            content_md: `Approve merge suggestion for sources: ${group.map((a) => a.id).join(", ")}`,
            data: {
              schema_version: "1.0",
              produced_by: "curate.artifacts.v1",
              workflow_id: "curate.merge.apply.v1",
              recommended_next_job: {
                workflow_id: "curate.merge.apply.v1",
                input: {
                  sourceIds: group.map((a) => a.id),
                  title: canonicalTitle,
                  noteType,
                  summarize,
                  summaryProfile,
                  supersede: true,
                  indexEmbeddings,
                },
              },
              suggestion: true,
            },
          });
        }
      }

      return;
    }

    if (action === "reconcile") {
      const reconcileSources =
        sourceIds.length > 0
          ? sourceIds.map((id) => getArtifactOrThrow(ctx.repo, id))
          : ctx.findArtifacts({ type: typeFilter, since, limit });

      if (reconcileSources.length < 2) {
        throw new Error(
          "curate.artifacts.v1 reconcile action requires at least two artifacts",
        );
      }

      const blocks = reconcileSources.map((artifact) => {
        const header = artifact.title
          ? `${artifact.title} (${artifact.id})`
          : artifact.id;
        return `### ${header}\n${artifact.content_md ?? ""}`.trim();
      });

      const prompt = [
        "Resolve conflicts and produce a reconciled note from the sources below.",
        "Requirements:",
        "- Identify conflicts or contradictions",
        "- Propose a best-effort resolution (or mark as unresolved if needed)",
        "- Provide a clean reconciled summary",
        "- Include a short 'Decision Log' table (Conflict | Decision | Rationale | Source IDs)",
        reconcilePolicy
          ? `Conflict policy: ${formatPolicy(reconcilePolicy)}`
          : "",
        "",
        blocks.join("\n\n"),
      ]
        .filter(Boolean)
        .join("\n");

      const result = await ctx.llm.generateText({
        prompt,
        temperature: 0.2,
        maxTokens: 900,
        profile: summaryProfile,
      });

      ctx.emitArtifact({
        type: "curation.reconcile.v1",
        job_id: jobId,
        title: title ?? "Curation: Reconciled Note",
        content_md: result.text,
        data: {
          schema_version: "1",
          produced_by: "curate.artifacts.v1",
          action,
          source_ids: reconcileSources.map((a) => a.id),
          reconcile_policy: reconcilePolicy ?? null,
          llm_provider: result.provider,
          llm_usage: result.usage,
          summary_profile: summaryProfile,
        },
      });

      ctx.emitArtifact({
        type: "checkpoint.approval_request.v1",
        job_id: jobId,
        title: "Approval Required: Reconcile Suggestion",
        content_md: `Approve reconcile suggestion for sources: ${reconcileSources
          .map((a) => a.id)
          .join(", ")}`,
        data: {
          schema_version: "1.0",
          produced_by: "curate.artifacts.v1",
          workflow_id: "curate.reconcile.apply.v1",
          recommended_next_job: {
            workflow_id: "curate.reconcile.apply.v1",
            input: {
              reconcileArtifactId: `reconcile_${jobId}`,
              title: title ?? "Curation: Reconciled Note",
              noteType,
              supersede: true,
              indexEmbeddings,
            },
          },
          suggestion: true,
        },
      });

      if (indexEmbeddings) {
        const recent = new Date(Date.now() - 60 * 1000).toISOString();
        ctx.spawnJob("index.embeddings.v1", {
          owner_type: "artifact",
          since: recent,
          limit: 50,
        });
      }

      return;
    }

    if (action === "promote" && sourceIds.length === 0) {
      throw new Error("curate.artifacts.v1 promote action requires sourceIds");
    }

    if (action === "merge") {
      if (!targetId) {
        throw new Error("curate.artifacts.v1 merge action requires targetId");
      }
      if (sourceIds.length === 0) {
        throw new Error("curate.artifacts.v1 merge action requires sourceIds");
      }
    }

    const baseArtifact = targetId
      ? getArtifactOrThrow(ctx.repo, targetId)
      : undefined;
    const sources = sourceIds.map((id) => getArtifactOrThrow(ctx.repo, id));
    const allSources = baseArtifact ? [baseArtifact, ...sources] : sources;

    const sourceBlocks = allSources.map((artifact) => {
      const header = artifact.title
        ? `${artifact.title} (${artifact.id})`
        : artifact.id;
      return `### ${header}\n${artifact.content_md ?? ""}`.trim();
    });

    let content = sourceBlocks.join("\n\n");
    let llmMeta: Record<string, unknown> | undefined;

    if (summarize) {
      const prompt = [
        "Create a concise, durable canonical note from the sources below.",
        "Requirements:",
        "- Preserve important details and decisions",
        "- Resolve duplicates and contradictions when possible",
        "- Use headings and bullets for scanability",
        "- End with a short 'Open Questions' section if needed",
        "",
        sourceBlocks.join("\n\n"),
      ].join("\n");

      const result = await ctx.llm.generateText({
        prompt,
        temperature: 0.2,
        maxTokens: 900,
        profile: summaryProfile,
      });

      content = result.text;
      llmMeta = {
        llm_provider: result.provider,
        llm_usage: result.usage,
        summary_profile: summaryProfile,
      };
    }

    const canonicalTitle =
      title ??
      (action === "merge"
        ? `Merged Note: ${baseArtifact?.title ?? baseArtifact?.id ?? "unknown"}`
        : "Canonical Note");

    ctx.emitArtifact({
      type: noteType,
      job_id: jobId,
      title: canonicalTitle,
      content_md: content,
      data: {
        schema_version: "1",
        produced_by: "curate.artifacts.v1",
        action,
        source_ids: allSources.map((a) => a.id),
        merged_from:
          action === "merge" ? allSources.map((a) => a.id) : undefined,
        tags,
        summarize,
        ...llmMeta,
      },
    });

    if (supersede) {
      ctx.emitArtifact({
        type: "curation.supersedes.v1",
        job_id: jobId,
        title: "Curation: Superseded Sources",
        content_md: `Superseded sources: ${allSources.map((a) => a.id).join(", ")}`,
        data: {
          schema_version: "1",
          produced_by: "curate.artifacts.v1",
          action,
          source_ids: allSources.map((a) => a.id),
          canonical_note: {
            type: noteType,
            title: canonicalTitle,
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
