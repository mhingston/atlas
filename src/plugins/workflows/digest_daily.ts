import type { WorkflowPlugin } from "../types";

function buildSince(daysBack: number): string {
  const ms = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

function formatItem(item: {
  id: string;
  type: string;
  title: string | null;
  created_at: string;
}): string {
  const title = item.title ? ` — ${item.title}` : "";
  return `- [${item.id}] ${item.type}${title} (${item.created_at})`;
}

/**
 * Deterministic workflow: digest.daily.v1
 *
 * Builds a daily digest from recent artifacts without using LLMs.
 */
export const digestDailyWorkflow: WorkflowPlugin = {
  id: "digest.daily.v1",
  capabilities: ["db:read"],

  async run(ctx, input, jobId) {
    const daysBack = Math.min(Math.max(Number(input.days_back ?? 1), 1), 30);
    const since = String(input.since ?? buildSince(daysBack));
    const limit = Math.min(Math.max(Number(input.limit ?? 50), 1), 500);
    const type = input.type ? String(input.type) : undefined;

    const artifacts = ctx.repo.findArtifacts({
      type,
      since,
      limit,
    });

    const items = artifacts.map((artifact) => ({
      id: artifact.id,
      type: artifact.type,
      title: artifact.title ?? null,
      created_at: artifact.created_at,
    }));

    const content = items.length
      ? [
          "# Daily Digest",
          "",
          `Window since: ${since}`,
          "",
          ...items.map(formatItem),
        ].join("\n")
      : `No artifacts found since ${since}.`;

    ctx.emitArtifact({
      type: "digest.daily.v1",
      job_id: jobId,
      title: "Daily Digest",
      content_md: content,
      data: {
        schema_version: "1",
        produced_by: "digest.daily.v1",
        since,
        type: type ?? null,
        limit,
        returned: items.length,
        item_ids: items.map((item) => item.id),
      },
    });
  },
};
