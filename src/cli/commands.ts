/**
 * CLI command implementations for Atlas
 */

import type { AtlasClient } from "./client";

function formatDate(iso: string | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString();
}

function truncate(str: string | undefined, len: number): string {
  if (!str) return "";
  return str.length > len ? `${str.slice(0, len)}...` : str;
}

function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return "\x1b[32m"; // green
    case "failed":
      return "\x1b[31m"; // red
    case "needs_approval":
      return "\x1b[33m"; // yellow
    case "running":
      return "\x1b[34m"; // blue
    default:
      return "\x1b[90m"; // gray
  }
}

const RESET = "\x1b[0m";

export async function status(client: AtlasClient): Promise<void> {
  try {
    const health = await client.health();
    console.log(
      `Atlas Gateway: ${statusColor("completed")}${health.status}${RESET}`,
    );

    const jobs = await client.listJobs({ limit: 5 });
    if (jobs.length > 0) {
      console.log("\nRecent jobs:");
      for (const job of jobs) {
        const color = statusColor(job.status);
        const title = truncate(job.workflow_id, 30);
        console.log(
          `  ${color}${job.status.padEnd(15)}${RESET} ${job.id.slice(0, 8)}  ${title}`,
        );
      }
    }
  } catch (err) {
    console.error(`Atlas Gateway: ${statusColor("failed")}unreachable${RESET}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

export async function listJobs(
  client: AtlasClient,
  options: { status?: string; workflow?: string; limit?: number },
): Promise<void> {
  const jobs = await client.listJobs(options);

  if (jobs.length === 0) {
    console.log("No jobs found.");
    return;
  }

  console.log(`Found ${jobs.length} job(s):\n`);

  for (const job of jobs) {
    const color = statusColor(job.status);
    console.log(`${color}${job.status}${RESET}  ${job.id}`);
    console.log(`  Workflow: ${job.workflow_id}`);
    console.log(`  Created:  ${formatDate(job.created_at)}`);
    if (job.started_at)
      console.log(`  Started:  ${formatDate(job.started_at)}`);
    if (job.finished_at)
      console.log(`  Finished: ${formatDate(job.finished_at)}`);
    if (job.error) console.log(`  Error:    ${job.error}`);
    console.log();
  }
}

export async function showJob(client: AtlasClient, id: string): Promise<void> {
  const job = await client.getJob(id);

  const color = statusColor(job.status);
  console.log(`${color}${job.status}${RESET}  ${job.id}`);
  console.log(`Workflow: ${job.workflow_id}`);
  console.log(`Created:  ${formatDate(job.created_at)}`);
  console.log(`Started:  ${formatDate(job.started_at)}`);
  console.log(`Finished: ${formatDate(job.finished_at)}`);

  console.log("\nInput:");
  console.log(JSON.stringify(job.input, null, 2));

  if (job.output) {
    console.log("\nOutput:");
    console.log(JSON.stringify(job.output, null, 2));
  }

  if (job.error) {
    console.log(`\nError: ${job.error}`);
  }
}

export async function createJob(
  client: AtlasClient,
  workflowId: string,
  input: Record<string, unknown>,
): Promise<void> {
  const job = await client.createJob(workflowId, input);
  console.log(`Created job: ${job.id}`);
  console.log(`Workflow: ${job.workflow_id}`);
  console.log(`Status: ${job.status}`);
}

export async function approveJob(
  client: AtlasClient,
  id: string,
): Promise<void> {
  const job = await client.approveJob(id);
  console.log(`Approved job: ${job.id}`);
  console.log(`New status: ${job.status}`);
}

export async function denyJob(client: AtlasClient, id: string): Promise<void> {
  const job = await client.denyJob(id);
  console.log(`Denied job: ${job.id}`);
  console.log(`New status: ${job.status}`);
}

export async function listArtifacts(
  client: AtlasClient,
  options: { type?: string; limit?: number },
): Promise<void> {
  const artifacts = await client.listArtifacts(options);

  if (artifacts.length === 0) {
    console.log("No artifacts found.");
    return;
  }

  console.log(`Found ${artifacts.length} artifact(s):\n`);

  for (const artifact of artifacts) {
    const title = artifact.title ?? artifact.id;
    console.log(`${artifact.type}  ${artifact.id.slice(0, 8)}`);
    console.log(`  Title: ${truncate(title, 60)}`);
    console.log(`  Job:   ${artifact.job_id.slice(0, 8)}`);
    console.log(`  Created: ${formatDate(artifact.created_at)}`);
    console.log();
  }
}

export async function showArtifact(
  client: AtlasClient,
  id: string,
): Promise<void> {
  const artifact = await client.getArtifact(id);

  console.log(`${artifact.type}  ${artifact.id}`);
  console.log(`Job: ${artifact.job_id}`);
  console.log(`Created: ${formatDate(artifact.created_at)}`);

  if (artifact.title) {
    console.log(`\nTitle: ${artifact.title}`);
  }

  if (artifact.content_md) {
    console.log("\nContent:");
    console.log(artifact.content_md);
  }

  console.log("\nData:");
  console.log(JSON.stringify(artifact.data, null, 2));
}

export async function search(
  client: AtlasClient,
  query: string,
  options: { limit?: number },
): Promise<void> {
  const results = await client.search(query, options);

  if (results.length === 0) {
    console.log("No results found.");
    return;
  }

  console.log(`Found ${results.length} result(s) for "${query}":\n`);

  for (const result of results) {
    const score = Math.round(result.score * 100);
    console.log(
      `${result.owner_type}:${result.owner_id.slice(0, 16)}  Score: ${score}%`,
    );
  }
}

export async function sync(client: AtlasClient): Promise<void> {
  const result = await client.sync();
  console.log(result.message);
}

export async function listSkills(client: AtlasClient): Promise<void> {
  const skills = await client.listSkills();
  if (skills.length === 0) {
    console.log("No skills found.");
    return;
  }

  console.log(`Found ${skills.length} skill(s):\n`);
  for (const skill of skills) {
    const desc = skill.description ?? "";
    console.log(`${skill.name}`);
    if (desc) {
      console.log(`  ${truncate(desc, 80)}`);
    }
    console.log(`  Path: ${skill.path}`);
    if (skill.allowedTools && skill.allowedTools.length > 0) {
      console.log(`  Tools: ${skill.allowedTools.join(", ")}`);
    }
    console.log();
  }
}

export async function showSkill(
  client: AtlasClient,
  name: string,
): Promise<void> {
  const skill = await client.getSkill(name);
  console.log(`${skill.name}`);
  if (skill.description) {
    console.log(`Description: ${skill.description}`);
  }
  console.log(`Path: ${skill.path}`);
  if (skill.allowedTools && skill.allowedTools.length > 0) {
    console.log(`Tools: ${skill.allowedTools.join(", ")}`);
  }
  if (skill.frontmatter && Object.keys(skill.frontmatter).length > 0) {
    console.log("\nFrontmatter:");
    console.log(JSON.stringify(skill.frontmatter, null, 2));
  }
  console.log("\nContent:");
  console.log(skill.content);
}

export async function showJobTrace(
  client: AtlasClient,
  id: string,
): Promise<void> {
  const trace = await client.getJobTrace(id);

  if (trace.length === 0) {
    console.log("No trace events found.");
    return;
  }

  console.log(`Job trace for ${id}:\n`);

  for (const event of trace) {
    const ts = event.ts
      ? new Date(event.ts as string).toLocaleString()
      : "unknown";
    const type = event.type ?? "unknown";
    console.log(`[${ts}] ${type}`);
    if (
      event.data &&
      Object.keys(event.data as Record<string, unknown>).length > 0
    ) {
      console.log(JSON.stringify(event.data, null, 2));
    }
  }
}

export async function showJobTimeline(
  client: AtlasClient,
  id: string,
): Promise<void> {
  const html = await client.getJobTimeline(id);

  // Extract readable text from HTML or just output it
  // For now, we'll tell the user to open in browser
  console.log(`Timeline HTML for job ${id}:`);
  console.log("(Open in a browser for the full view)");
  console.log("\n---\n");

  // Extract title and basic info
  const titleMatch = html.match(/<title>(.*?)<\/title>/);
  if (titleMatch) {
    console.log(`Title: ${titleMatch[1]}`);
  }

  const jobIdMatch = html.match(/Job ID:.*?(\w+)/);
  if (jobIdMatch) {
    console.log(`Job: ${jobIdMatch[1]}`);
  }

  console.log("\nRaw HTML length:", html.length, "characters");
}

export async function showOpsDashboard(client: AtlasClient): Promise<void> {
  const html = await client.getOpsDashboard();

  console.log("Ops Dashboard:");
  console.log(
    "(Open http://localhost:3000/ops in a browser for the full view)",
  );
  console.log("\n---\n");

  // Extract job counts
  const statusMatches = html.matchAll(
    /<li><strong>(\w+)<\/strong>: (\d+)<\/li>/g,
  );
  const counts: Record<string, number> = {};
  for (const match of statusMatches) {
    const status = match[1];
    const count = match[2];
    if (status && count) {
      counts[status] = Number.parseInt(count, 10);
    }
  }

  if (Object.keys(counts).length > 0) {
    console.log("Job counts:");
    for (const [status, count] of Object.entries(counts)) {
      console.log(`  ${status}: ${count}`);
    }
  }
}

export async function showConfig(): Promise<void> {
  console.log("Atlas Configuration:");
  console.log("");
  console.log(
    `ATLAS_URL: ${process.env.ATLAS_URL ?? "http://localhost:3000 (default)"}`,
  );
  console.log(
    `ATLAS_DB_PATH: ${process.env.ATLAS_DB_PATH ?? "data/atlas.db (default)"}`,
  );
  console.log(
    `ATLAS_LLM_PROVIDER: ${process.env.ATLAS_LLM_PROVIDER ?? "mock (default)"}`,
  );
  console.log(
    `ATLAS_HARNESS_ENABLED: ${process.env.ATLAS_HARNESS_ENABLED ?? "false (default)"}`,
  );
  console.log(
    `ATLAS_REQUIRE_APPROVAL_BY_DEFAULT: ${process.env.ATLAS_REQUIRE_APPROVAL_BY_DEFAULT ?? "false (default)"}`,
  );
  console.log("");
  console.log("Environment file: .env");
}

// Batch operations

export async function batchApprove(
  client: AtlasClient,
  options: { status?: string; workflow?: string; limit?: number },
): Promise<void> {
  // Get jobs that need approval
  const jobs = await client.listJobs({
    status: options.status ?? "needs_approval",
    workflow: options.workflow,
    limit: options.limit ?? 50,
  });

  if (jobs.length === 0) {
    console.log("No jobs to approve.");
    return;
  }

  console.log(`Found ${jobs.length} job(s) to approve.`);

  let approved = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await client.approveJob(job.id);
      approved++;
      console.log(`✓ Approved ${job.id.slice(0, 8)} (${job.workflow_id})`);
    } catch (err) {
      failed++;
      console.error(
        `✗ Failed to approve ${job.id.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`\nResults: ${approved} approved, ${failed} failed`);
}

export async function batchDeny(
  client: AtlasClient,
  options: { status?: string; workflow?: string; limit?: number },
): Promise<void> {
  // Get jobs that need denial
  const jobs = await client.listJobs({
    status: options.status ?? "needs_approval",
    workflow: options.workflow,
    limit: options.limit ?? 50,
  });

  if (jobs.length === 0) {
    console.log("No jobs to deny.");
    return;
  }

  console.log(`Found ${jobs.length} job(s) to deny.`);

  let denied = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await client.denyJob(job.id);
      denied++;
      console.log(`✓ Denied ${job.id.slice(0, 8)} (${job.workflow_id})`);
    } catch (err) {
      failed++;
      console.error(
        `✗ Failed to deny ${job.id.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`\nResults: ${denied} denied, ${failed} failed`);
}

export async function batchRetry(
  client: AtlasClient,
  options: { status?: string; workflow?: string; limit?: number },
): Promise<void> {
  // Get jobs to retry (typically failed jobs)
  const jobs = await client.listJobs({
    status: options.status ?? "failed",
    workflow: options.workflow,
    limit: options.limit ?? 50,
  });

  if (jobs.length === 0) {
    console.log("No jobs to retry.");
    return;
  }

  console.log(`Found ${jobs.length} job(s) to retry.`);
  console.log("Note: Retry creates new jobs with the same input.\n");

  let retried = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      // Create a new job with the same workflow and input
      await client.createJob(job.workflow_id, job.input);
      retried++;
      console.log(`✓ Retrying ${job.id.slice(0, 8)} (${job.workflow_id})`);
    } catch (err) {
      failed++;
      console.error(
        `✗ Failed to retry ${job.id.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`\nResults: ${retried} retried, ${failed} failed`);
}

export async function batchDeleteArtifacts(
  _client: AtlasClient,
  _options: { type?: string; since?: string; limit?: number; dryRun?: boolean },
): Promise<void> {
  // Note: API doesn't support bulk delete yet
  console.log("Batch artifact deletion not yet implemented in API.");
  console.log("Use individual artifact operations for now.");
}
