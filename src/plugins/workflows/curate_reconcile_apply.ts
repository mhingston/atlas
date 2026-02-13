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

function extractSourceIds(artifact: Artifact): string[] {
  const raw = artifact.data?.source_ids;
  if (!Array.isArray(raw)) return [];
  return raw.map(String).filter(Boolean);
}

/**
 * Reference workflow: curate.reconcile.apply.v1
 *
 * Applies a reconciled note after explicit approval.
 */
export const curateReconcileApplyWorkflow: WorkflowPlugin = {
  id: "curate.reconcile.apply.v1",

  async run(ctx, input, jobId) {
    const reconcileArtifactId = input.reconcileArtifactId
      ? String(input.reconcileArtifactId)
      : undefined;
    if (!reconcileArtifactId) {
      throw new Error("curate.reconcile.apply.v1 requires reconcileArtifactId");
    }

    const reconcileArtifact = getArtifactOrThrow(ctx.repo, reconcileArtifactId);
    if (reconcileArtifact.type !== "curation.reconcile.v1") {
      throw new Error(
        `Artifact ${reconcileArtifactId} is not a curation.reconcile.v1`,
      );
    }

    const title = input.title
      ? String(input.title)
      : (reconcileArtifact.title ?? "Reconciled Note");
    const noteType = input.noteType
      ? String(input.noteType)
      : "note.canonical.v1";
    const supersede = input.supersede === true;
    const indexEmbeddings = input.indexEmbeddings !== false;

    const sourceIds = extractSourceIds(reconcileArtifact);

    ctx.emitArtifact({
      type: noteType,
      job_id: jobId,
      title,
      content_md: reconcileArtifact.content_md ?? "",
      data: {
        schema_version: "1",
        produced_by: "curate.reconcile.apply.v1",
        source_ids: sourceIds,
        reconcile_artifact_id: reconcileArtifactId,
        reconcile_policy: reconcileArtifact.data?.reconcile_policy ?? null,
      },
    });

    if (supersede && sourceIds.length > 0) {
      ctx.emitArtifact({
        type: "curation.supersedes.v1",
        job_id: jobId,
        title: "Curation: Superseded Sources",
        content_md: `Superseded sources: ${sourceIds.join(", ")}`,
        data: {
          schema_version: "1",
          produced_by: "curate.reconcile.apply.v1",
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
