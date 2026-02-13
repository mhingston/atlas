/**
 * Enhanced Reconcile Workflow with Conflict Resolution
 *
 * This workflow intelligently reconciles conflicting artifacts by:
 * 1. Detecting structured data conflicts using resolution policies
 * 2. Auto-resolving based on confidence thresholds
 * 3. Using LLM assistance for complex/natural language conflicts
 * 4. Producing a structured decision log
 */

import {
  type ConflictReport,
  type ConflictResolutionPolicy,
  createPolicyFromInput,
  formatConflictReport,
  reconcileArtifacts,
} from "../../core/conflict_resolution";
import type { Artifact } from "../../core/types";
import type { WorkflowPlugin } from "../types";

function formatBlocks(artifacts: Artifact[]): string[] {
  return artifacts.map((artifact) => {
    const header = artifact.title
      ? `${artifact.title} (${artifact.id})`
      : artifact.id;
    return `### ${header}\n${artifact.content_md ?? ""}`.trim();
  });
}

function buildReconcilePrompt(
  artifacts: Artifact[],
  conflictReport: ConflictReport | null,
  policy: ConflictResolutionPolicy,
  autoResolvedFields: string[],
): string {
  const blocks = formatBlocks(artifacts);

  const lines: string[] = [
    "Reconcile the following sources into a canonical note.",
    "",
  ];

  // Add conflict information
  if (conflictReport && conflictReport.conflicts.length > 0) {
    lines.push("## Detected Conflicts");
    lines.push("");

    const unresolved = conflictReport.conflicts.filter(
      (c) => !c.isResolved && c.requiresManualReview,
    );

    if (autoResolvedFields.length > 0) {
      lines.push(`**Auto-resolved fields:** ${autoResolvedFields.join(", ")}`);
      lines.push("");
    }

    if (unresolved.length > 0) {
      lines.push("**Unresolved conflicts requiring attention:**");
      for (const conflict of unresolved) {
        lines.push(
          `- ${conflict.field}: ${conflict.values.length} distinct values`,
        );
      }
      lines.push("");
    }

    // Add decision log
    if (conflictReport.decisionLog.length > 0) {
      lines.push("## Auto-Resolution Decisions");
      lines.push("");
      lines.push("| Field | Resolution | Confidence |");
      lines.push("|-------|------------|------------|");
      for (const entry of conflictReport.decisionLog) {
        const decision =
          entry.decision.length > 30
            ? `${entry.decision.slice(0, 30)}...`
            : entry.decision;
        lines.push(
          `| ${entry.conflict} | ${decision} | ${Math.round(entry.confidence * 100)}% |`,
        );
      }
      lines.push("");
    }

    lines.push("## Resolution Policy");
    lines.push(`- Strategy: ${policy.strategy}`);
    if (policy.sourcePriority) {
      lines.push(`- Source priority: ${policy.sourcePriority.join(" > ")}`);
    }
    lines.push(
      `- Require citations: ${policy.requireCitations ? "yes" : "no"}`,
    );
    lines.push(`- Allow unresolved: ${policy.allowUnresolved ? "yes" : "no"}`);
    lines.push("");
  }

  lines.push("## Requirements");
  lines.push("1. Synthesize the sources into a coherent narrative");
  if (conflictReport?.conflicts.some((c) => c.requiresManualReview)) {
    lines.push(
      "2. For unresolved conflicts, make a best-effort decision and document your reasoning",
    );
  } else {
    lines.push("2. Integrate the auto-resolved decisions into the narrative");
  }
  lines.push(
    "3. Preserve important details and unique insights from each source",
  );
  lines.push("4. Use clear structure with headings and bullet points");
  if (policy.requireCitations) {
    lines.push("5. Include inline citations [source_id] for key facts");
  }
  lines.push("6. End with a 'Decision Log' section explaining major choices");
  lines.push("");

  lines.push("## Sources");
  lines.push("");
  lines.push(...blocks);

  return lines.join("\n");
}

function buildLLMOnlyPrompt(
  artifacts: Artifact[],
  policy: ConflictResolutionPolicy,
): string {
  const blocks = formatBlocks(artifacts);

  return [
    "Reconcile the following sources into a canonical note.",
    "",
    "## Resolution Policy",
    `- Strategy: ${policy.strategy}`,
    policy.sourcePriority
      ? `- Source priority: ${policy.sourcePriority.join(" > ")}`
      : "",
    `- Require citations: ${policy.requireCitations ? "yes" : "no"}`,
    `- Allow unresolved: ${policy.allowUnresolved ? "yes" : "no"}`,
    "",
    "## Requirements",
    "1. Identify conflicts or contradictions between sources",
    "2. Propose best-effort resolutions using the policy above",
    "3. Create a clean, structured synthesis",
    policy.requireCitations ? "4. Include inline citations [source_id]" : "",
    "4. Include a 'Decision Log' table: Conflict | Decision | Rationale | Sources",
    "",
    "## Sources",
    "",
    ...blocks,
  ]
    .filter(Boolean)
    .join("\n");
}

type ReconcileInput = {
  sourceIds?: string[];
  typeFilter?: string;
  since?: string;
  limit?: number;
  title?: string;
  noteType?: string;
  summaryProfile?: "fast" | "balanced" | "quality";
  indexEmbeddings?: boolean;
  supersede?: boolean;
  // Conflict resolution policy options
  strategy?:
    | "latest"
    | "earliest"
    | "longest"
    | "shortest"
    | "source-priority"
    | "majority-vote"
    | "consensus"
    | "manual";
  sourcePriority?: string[];
  requireCitations?: boolean;
  allowUnresolved?: boolean;
  autoResolveThreshold?: number;
  fields?: string[]; // Fields to check for conflicts
  useStructuredResolution?: boolean; // Enable structured conflict detection
};

export const curateReconcileWorkflow: WorkflowPlugin = {
  id: "curate.reconcile.v2",

  async run(ctx, input: ReconcileInput, jobId) {
    const sourceIds = Array.isArray(input.sourceIds)
      ? input.sourceIds.map(String)
      : [];
    const typeFilter = input.typeFilter ? String(input.typeFilter) : undefined;
    const since = input.since ? String(input.since) : undefined;
    const limit = Number.isFinite(Number(input.limit))
      ? Math.max(2, Number(input.limit))
      : undefined;
    const title = input.title ? String(input.title) : undefined;
    const noteType = input.noteType
      ? String(input.noteType)
      : "note.canonical.v1";
    const summaryProfile =
      (input.summaryProfile as "fast" | "balanced" | "quality") ?? "balanced";
    const indexEmbeddings = input.indexEmbeddings !== false;
    const supersede = input.supersede === true;
    const useStructuredResolution = input.useStructuredResolution !== false;
    const fields = Array.isArray(input.fields)
      ? input.fields.map(String)
      : ["status", "priority", "category", "tags"];

    // Build conflict resolution policy
    const policy = createPolicyFromInput({
      strategy: input.strategy,
      sourcePriority: input.sourcePriority,
      requireCitations:
        input.requireCitations !== undefined ? input.requireCitations : true,
      allowUnresolved:
        input.allowUnresolved !== undefined ? input.allowUnresolved : true,
      autoResolveThreshold: input.autoResolveThreshold,
    });

    // Gather source artifacts
    const reconcileSources =
      sourceIds.length > 0
        ? sourceIds.map((id) => {
            const artifact = ctx.repo.getArtifact(id);
            if (!artifact) {
              throw new Error(`curate.reconcile.v2: Artifact not found: ${id}`);
            }
            return artifact;
          })
        : ctx.findArtifacts({ type: typeFilter, since, limit });

    if (reconcileSources.length < 2) {
      throw new Error(
        "curate.reconcile.v2: At least two artifacts required for reconciliation",
      );
    }

    let conflictReport: ConflictReport | null = null;
    let autoResolvedFields: string[] = [];
    let prompt: string;

    if (useStructuredResolution) {
      // Try structured conflict resolution first
      conflictReport = reconcileArtifacts(reconcileSources, fields, policy);
      autoResolvedFields = conflictReport.conflicts
        .filter((c) => c.isResolved)
        .map((c) => c.field);

      // Build prompt with conflict information
      prompt = buildReconcilePrompt(
        reconcileSources,
        conflictReport,
        policy,
        autoResolvedFields,
      );
    } else {
      // Use traditional LLM-only reconciliation
      prompt = buildLLMOnlyPrompt(reconcileSources, policy);
    }

    // Generate reconciled content
    const result = await ctx.llm.generateText({
      prompt,
      temperature: 0.2,
      maxTokens: 1200,
      profile: summaryProfile,
    });

    // Build final content with conflict report if available
    let finalContent = result.text;
    if (conflictReport && policy.generateDecisionLog) {
      const reportMarkdown = formatConflictReport(conflictReport);
      finalContent = `${finalContent}\n\n---\n\n${reportMarkdown}`;
    }

    // Create reconcile artifact
    const reconcileArtifactId = `reconcile_${jobId}`;
    ctx.commands.enqueue({
      type: "artifact.create",
      artifact: {
        type: "curation.reconcile.v2",
        job_id: jobId,
        title: title ?? "Reconciled Note",
        content_md: finalContent,
        data: {
          schema_version: "2",
          produced_by: "curate.reconcile.v2",
          source_ids: reconcileSources.map((a) => a.id),
          reconcile_policy: policy,
          conflict_report: conflictReport
            ? {
                status: conflictReport.status,
                confidence: conflictReport.confidence,
                requires_manual_review: conflictReport.requiresManualReview,
                auto_resolved_fields: autoResolvedFields,
                unresolved_count: conflictReport.conflicts.filter(
                  (c) => !c.isResolved,
                ).length,
              }
            : null,
          llm_provider: result.provider,
          llm_usage: result.usage,
          summary_profile: summaryProfile,
        },
      },
    });

    // Emit visible artifact
    ctx.emitArtifact({
      type: "curation.reconcile.v2",
      job_id: jobId,
      title: title ?? "Reconciled Note",
      content_md: finalContent,
      data: {
        schema_version: "2",
        produced_by: "curate.reconcile.v2",
        source_ids: reconcileSources.map((a) => a.id),
        reconcile_policy: policy,
        llm_provider: result.provider,
        llm_usage: result.usage,
        summary_profile: summaryProfile,
      },
    });

    // Create approval checkpoint
    ctx.emitArtifact({
      type: "checkpoint.approval_request.v1",
      job_id: jobId,
      title: "Approval Required: Reconcile Suggestion",
      content_md: `Approve reconcile of ${reconcileSources.length} sources: ${reconcileSources
        .map((a) => a.id)
        .join(", ")}`,
      data: {
        schema_version: "1.0",
        produced_by: "curate.reconcile.v2",
        workflow_id: "curate.reconcile.apply.v1",
        recommended_next_job: {
          workflow_id: "curate.reconcile.apply.v1",
          input: {
            reconcileArtifactId: reconcileArtifactId,
            title: title ?? "Reconciled Note",
            noteType,
            supersede: true,
            indexEmbeddings,
          },
        },
        conflict_summary: conflictReport
          ? {
              total_conflicts: conflictReport.conflicts.length,
              auto_resolved: autoResolvedFields.length,
              requires_review: conflictReport.requiresManualReview,
            }
          : null,
        suggestion: true,
      },
    });

    // Spawn embedding indexing job if enabled
    if (indexEmbeddings) {
      const recent = new Date(Date.now() - 60 * 1000).toISOString();
      ctx.spawnJob("index.embeddings.v1", {
        owner_type: "artifact",
        since: recent,
        limit: 50,
      });
    }

    // Create supersede artifact if requested
    if (supersede) {
      ctx.emitArtifact({
        type: "curation.supersedes.v1",
        job_id: jobId,
        title: "Superseded Sources",
        content_md: `Reconcile supersedes: ${reconcileSources
          .map((a) => a.id)
          .join(", ")}`,
        data: {
          schema_version: "1",
          produced_by: "curate.reconcile.v2",
          source_ids: reconcileSources.map((a) => a.id),
          reconcile_artifact: reconcileArtifactId,
        },
      });
    }
  },
};
