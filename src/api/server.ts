import { ulid } from "ulid";
import { logError } from "../core/logger";
import type { CommandQueue } from "../core/queue";
import type { ReadOnlyRepo } from "../core/repo";
import type { Artifact, Entity, JobStatus } from "../core/types";
import type { FlushLoop } from "../jobs/loop";
import type { PluginRegistry } from "../plugins/registry";
import { loadSkillRegistry, resolveSkillPaths } from "../skills";
import {
  type ChatCompletionRequest,
  createChatCompletion,
  createChatCompletionStream,
  createStreamResponse,
  getModels,
  parseJsonBody,
} from "./openai_adapter";

/**
 * HTTP API routes for Atlas Gateway
 */
export function createServer(
  registry: PluginRegistry,
  repo: ReadOnlyRepo,
  commands: CommandQueue,
  flushLoop: FlushLoop,
  port?: number,
) {
  const fetchHandler = createFetchHandler(registry, repo, commands, flushLoop);
  return Bun.serve({
    port: port ?? Number(process.env.PORT ?? 3000),
    fetch: fetchHandler,
  });
}

export function createFetchHandler(
  registry: PluginRegistry,
  repo: ReadOnlyRepo,
  commands: CommandQueue,
  flushLoop: FlushLoop,
) {
  let skillRegistryCache: Awaited<ReturnType<typeof loadSkillRegistry>> | null =
    null;
  const getSkillRegistry = async () => {
    if (!skillRegistryCache) {
      skillRegistryCache = await loadSkillRegistry({
        paths: resolveSkillPaths(),
      });
    }
    return skillRegistryCache;
  };

  return async function handleFetch(req: Request) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // GET /health
    if (path === "/health" && method === "GET") {
      return jsonResponse({ status: "ok" });
    }

    // GET /v1/models (OpenAI-compatible)
    if (path === "/v1/models" && method === "GET") {
      return jsonResponse(getModels());
    }

    // POST /v1/chat/completions (OpenAI-compatible)
    if (path === "/v1/chat/completions" && method === "POST") {
      const body = await parseJsonBody(req);
      if (!body) {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const requestBody = body as unknown as ChatCompletionRequest;

      if (!requestBody.model) {
        return jsonResponse({ error: "model is required" }, 400);
      }

      if (
        !Array.isArray(requestBody.messages) ||
        requestBody.messages.length === 0
      ) {
        return jsonResponse({ error: "messages array is required" }, 400);
      }

      try {
        if (requestBody.stream) {
          // Streaming response
          const generator = createChatCompletionStream(
            requestBody,
            commands,
            repo,
          );
          return createStreamResponse(generator);
        }
        // Non-streaming response
        const response = await createChatCompletion(
          requestBody,
          commands,
          repo,
          () => flushLoop.flushOnce(),
        );
        return jsonResponse(response);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logError("api.chat_completions_error", { error });
        return jsonResponse({ error: errorMessage }, 500);
      }
    }

    // GET /ops
    if (path === "/ops" && method === "GET") {
      const statusParam = url.searchParams.get("status") ?? "all";
      const workflowParam = url.searchParams.get("workflow") ?? "";
      const limitParam = Number.parseInt(
        url.searchParams.get("limit") ?? "50",
        10,
      );
      const limit =
        Number.isFinite(limitParam) && limitParam > 0
          ? Math.min(200, limitParam)
          : 50;
      const jobsRaw =
        statusParam === "all"
          ? repo.listJobs({ limit })
          : repo.listJobs({ status: statusParam as JobStatus, limit });
      const jobs = workflowParam
        ? jobsRaw.filter((job) => job.workflow_id === workflowParam)
        : jobsRaw;
      const counts = repo.countJobsByStatus(
        workflowParam ? { workflowId: workflowParam } : undefined,
      );

      const countItems = Object.entries(counts)
        .map(
          ([status, count]) =>
            `<li><strong>${escapeHtml(status)}</strong>: ${count}</li>`,
        )
        .join("\n");

      const jobRows = jobs.length
        ? jobs
            .map((job) => {
              const meta = [
                `Status: ${job.status}`,
                job.started_at ? `Started: ${job.started_at}` : "Started: -",
                job.finished_at
                  ? `Finished: ${job.finished_at}`
                  : "Finished: -",
              ].join(" · ");
              const approvalControls =
                job.status === "needs_approval"
                  ? `
                    <form method="POST" action="/jobs/${escapeHtml(job.id)}/approve">
                      <button type="submit">Approve</button>
                    </form>
                    <form method="POST" action="/jobs/${escapeHtml(job.id)}/deny">
                      <button type="submit">Deny</button>
                    </form>
                  `
                  : "";
              return `
                <li>
                  <div><strong>${escapeHtml(job.id)}</strong> — ${escapeHtml(job.workflow_id)}</div>
                  <div class="meta">${escapeHtml(meta)}</div>
                  <div class="links">
                    <a href="/jobs/${escapeHtml(job.id)}">JSON</a>
                    <a href="/jobs/${escapeHtml(job.id)}/trace">Trace</a>
                    <a href="/jobs/${escapeHtml(job.id)}/timeline">Timeline</a>
                    <a href="/artifacts?job_id=${escapeHtml(job.id)}">Artifacts</a>
                    ${approvalControls}
                  </div>
                </li>
              `;
            })
            .join("\n")
        : "<li>No jobs found.</li>";

      const html = `<!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Atlas Ops</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; margin: 24px; }
              h1 { margin-bottom: 6px; }
              ul { padding-left: 20px; }
              li { margin-bottom: 12px; }
              .meta { color: #555; font-size: 13px; margin-top: 4px; }
              .links { display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap; }
              .links a { text-decoration: none; color: #0a58ca; }
              form { display: inline; }
              button { padding: 4px 10px; }
              .panel { margin-bottom: 22px; }
            </style>
          </head>
          <body>
            <h1>Atlas Ops</h1>
            <div class="panel">
              <div><strong>Quick Links:</strong> <a href="/approvals">Approvals</a> · <a href="/approvals.json">Approvals JSON</a></div>
            </div>
            <div class="panel">
              <h2>Status Counts</h2>
              <ul>${countItems}</ul>
            </div>
            <div class="panel">
              <h2>Recent Jobs</h2>
              <form method="GET" action="/ops">
                <label for="status">Status:</label>
                <select id="status" name="status">
                  ${[
                    "all",
                    "queued",
                    "running",
                    "verifying",
                    "needs_approval",
                    "succeeded",
                    "failed",
                  ]
                    .map((status) => {
                      const selected =
                        status === statusParam ? " selected" : "";
                      return `<option value="${escapeHtml(status)}"${selected}>${escapeHtml(status)}</option>`;
                    })
                    .join("\n")}
                </select>
                <label for="workflow">Workflow:</label>
                <input
                  id="workflow"
                  name="workflow"
                  type="text"
                  placeholder="scratchpad.v1"
                  value="${escapeHtml(workflowParam)}"
                />
                <label for="limit">Limit:</label>
                <input id="limit" name="limit" type="number" min="1" max="200" value="${limit}" />
                <button type="submit">Filter</button>
              </form>
              <ul>${jobRows}</ul>
            </div>
          </body>
        </html>`;

      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // POST /sync
    if (path === "/sync" && method === "POST") {
      const body = (await req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const sourceIds = Array.isArray(body.sources) ? body.sources : [];

      // Trigger source syncs (async, returns immediately)
      if (sourceIds.length === 0) {
        // Sync all sources
        for (const [id, source] of registry.sources) {
          source
            .sync({
              repo,
              commands,
              nowIso: () => new Date().toISOString(),
            })
            .catch((error) => {
              logError("api.sync_error", { source_id: id, error });
            });
        }
      } else {
        // Sync specific sources
        for (const id of sourceIds) {
          const source = registry.getSource(id);
          if (source) {
            source
              .sync({
                repo,
                commands,
                nowIso: () => new Date().toISOString(),
              })
              .catch((error) => {
                logError("api.sync_error", { source_id: id, error });
              });
          }
        }
      }

      return jsonResponse({ status: "sync_triggered" });
    }

    // POST /jobs
    if (path === "/jobs" && method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const jobBody = body as Record<string, unknown>;
      if (!jobBody.workflow_id) {
        return jsonResponse({ error: "workflow_id required" }, 400);
      }

      const jobId = `job_${ulid()}`;
      commands.enqueue({
        type: "job.create",
        job: {
          id: jobId,
          workflow_id: String(jobBody.workflow_id),
          input: (jobBody.input as Record<string, unknown>) || {},
        },
      });

      return jsonResponse({ job_id: jobId, status: "queued" });
    }

    // GET /jobs/:id/trace
    if (path.match(/^\/jobs\/[^/]+\/trace$/) && method === "GET") {
      const id = path.split("/")[2];
      if (!id) {
        return jsonResponse({ error: "Invalid job ID" }, 400);
      }
      const job = repo.getJob(id);
      if (!job) {
        return jsonResponse({ error: "Job not found" }, 404);
      }
      const since = url.searchParams.get("since") ?? undefined;
      const limitParam = Number.parseInt(
        url.searchParams.get("limit") ?? "200",
        10,
      );
      const limit =
        Number.isFinite(limitParam) && limitParam > 0
          ? Math.min(1000, limitParam)
          : 200;

      const events = repo.listTraceEvents({ jobId: id, since, limit });
      return jsonResponse({
        job,
        trace_id: id,
        events,
      });
    }

    // GET /jobs/:id/timeline
    if (path.match(/^\/jobs\/[^/]+\/timeline$/) && method === "GET") {
      const id = path.split("/")[2];
      if (!id) {
        return jsonResponse({ error: "Invalid job ID" }, 400);
      }
      const job = repo.getJob(id);
      if (!job) {
        return jsonResponse({ error: "Job not found" }, 404);
      }
      const since = url.searchParams.get("since") ?? undefined;
      const limitParam = Number.parseInt(
        url.searchParams.get("limit") ?? "200",
        10,
      );
      const limit =
        Number.isFinite(limitParam) && limitParam > 0
          ? Math.min(1000, limitParam)
          : 200;
      const events = repo.listTraceEvents({ jobId: id, since, limit });

      const rows = events
        .map((event) => {
          const summary = event.message ?? event.kind;
          const status = event.status ? ` (${event.status})` : "";
          const duration =
            event.duration_ms != null ? ` · ${event.duration_ms}ms` : "";
          return `
            <li>
              <div><strong>${escapeHtml(summary)}</strong>${escapeHtml(status)}</div>
              <div style="color:#555;font-size:13px;">
                ${escapeHtml(event.kind)} · ${escapeHtml(event.created_at)}${escapeHtml(duration)}
              </div>
            </li>
          `;
        })
        .join("\n");

      const html = `<!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Atlas Trace Timeline</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; margin: 24px; }
              h1 { margin-bottom: 6px; }
              ul { padding-left: 20px; }
              li { margin-bottom: 14px; }
              .meta { color: #666; font-size: 13px; }
            </style>
          </head>
          <body>
            <h1>Trace Timeline</h1>
            <div class="meta">Job: ${escapeHtml(job.id)} · Workflow: ${escapeHtml(job.workflow_id)}</div>
            <ul>${rows || "<li>No trace events yet.</li>"}</ul>
          </body>
        </html>`;

      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // GET /jobs/:id
    if (
      path.startsWith("/jobs/") &&
      method === "GET" &&
      !path.endsWith("/approve") &&
      !path.endsWith("/deny") &&
      !path.endsWith("/trace") &&
      !path.endsWith("/timeline")
    ) {
      const id = path.split("/")[2];
      if (!id) {
        return jsonResponse({ error: "Invalid job ID" }, 400);
      }
      const job = repo.getJob(id);

      if (!job) {
        return jsonResponse({ error: "Job not found" }, 404);
      }

      return jsonResponse(job);
    }

    // POST /jobs/:id/approve
    if (path.match(/^\/jobs\/[^/]+\/approve$/) && method === "POST") {
      const id = path.split("/")[2];
      if (!id) {
        return jsonResponse({ error: "Invalid job ID" }, 400);
      }

      const job = repo.getJob(id);
      if (!job) {
        return jsonResponse({ error: "Job not found" }, 404);
      }

      if (job.status !== "needs_approval") {
        return jsonResponse(
          { error: `Job status is ${job.status}, not needs_approval` },
          400,
        );
      }

      // Find the approval request artifact
      const approvalArtifacts = repo.findArtifacts({
        type: "checkpoint.approval_request.v1",
        jobId: id,
        limit: 1,
      });

      if (approvalArtifacts.length === 0) {
        return jsonResponse(
          { error: "No approval request artifact found" },
          404,
        );
      }

      const approvalArtifact = approvalArtifacts[0];
      if (!approvalArtifact) {
        return jsonResponse(
          { error: "No approval request artifact found" },
          404,
        );
      }
      const recommendedNext = approvalArtifact.data.recommended_next_job as
        | { workflow_id: string; input: Record<string, unknown> }
        | undefined;

      // If recommended_next_job present, create the follow-on job
      let nextJobId: string | undefined;
      if (recommendedNext) {
        nextJobId = `job_${ulid()}`;
        commands.enqueue({
          type: "job.create",
          job: {
            id: nextJobId,
            workflow_id: recommendedNext.workflow_id,
            input: recommendedNext.input || {},
          },
        });
      }

      // Emit approval granted artifact
      commands.enqueue({
        type: "artifact.create",
        artifact: {
          type: "checkpoint.approval_granted.v1",
          job_id: id,
          title: "Approval Granted",
          data: {
            schema_version: "1.0",
            produced_by: "api",
            workflow_id: job.workflow_id,
            approved_at: new Date().toISOString(),
          },
        },
      });

      // Mark original job as succeeded
      commands.enqueue({
        type: "job.updateStatus",
        id,
        status: "succeeded",
      });

      return jsonResponse({
        status: "approved",
        job_id: id,
        next_job_id: nextJobId,
      });
    }

    // POST /jobs/:id/deny
    if (path.match(/^\/jobs\/[^/]+\/deny$/) && method === "POST") {
      const id = path.split("/")[2];
      if (!id) {
        return jsonResponse({ error: "Invalid job ID" }, 400);
      }

      const job = repo.getJob(id);
      if (!job) {
        return jsonResponse({ error: "Job not found" }, 404);
      }

      if (job.status !== "needs_approval") {
        return jsonResponse(
          { error: `Job status is ${job.status}, not needs_approval` },
          400,
        );
      }

      // Emit denial artifact
      commands.enqueue({
        type: "artifact.create",
        artifact: {
          type: "checkpoint.approval_denied.v1",
          job_id: id,
          title: "Approval Denied",
          data: {
            schema_version: "1.0",
            produced_by: "api",
            workflow_id: job.workflow_id,
            denied_at: new Date().toISOString(),
          },
        },
      });

      // Mark job as failed
      commands.enqueue({
        type: "job.updateStatus",
        id,
        status: "failed",
      });

      return jsonResponse({
        status: "denied",
        job_id: id,
      });
    }

    // GET /artifacts
    if (path === "/artifacts" && method === "GET") {
      const type = url.searchParams.get("type") ?? undefined;
      const jobId = url.searchParams.get("job_id") ?? undefined;
      const limitParam = Number.parseInt(
        url.searchParams.get("limit") ?? "20",
        10,
      );
      const limit =
        Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 20;

      const artifacts = repo.findArtifacts({ type, jobId, limit });
      return jsonResponse({ artifacts });
    }

    // GET /approvals
    if (path === "/approvals" && method === "GET") {
      const pending = repo.listJobs({ status: "needs_approval", limit: 100 });

      const approvalRequests = repo.findArtifacts({
        type: "checkpoint.approval_request.v1",
        limit: 100,
      });
      const approvalGranted = repo.findArtifacts({
        type: "checkpoint.approval_granted.v1",
        limit: 100,
      });
      const approvalDenied = repo.findArtifacts({
        type: "checkpoint.approval_denied.v1",
        limit: 100,
      });

      const history = [
        ...approvalRequests,
        ...approvalGranted,
        ...approvalDenied,
      ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

      const pendingHtml = pending.length
        ? pending
            .map((job) => {
              const req = approvalRequests.find((a) => a.job_id === job.id);
              const summary = req?.content_md
                ? escapeHtml(req.content_md)
                : "Approval required.";
              return `
                <li>
                  <div><strong>${escapeHtml(job.id)}</strong> — ${escapeHtml(job.workflow_id)}</div>
                  <div style="margin:4px 0;color:#444;">${summary}</div>
                  <div style="display:flex;gap:8px;">
                    <form method="POST" action="/jobs/${escapeHtml(job.id)}/approve">
                      <button type="submit">Approve</button>
                    </form>
                    <form method="POST" action="/jobs/${escapeHtml(job.id)}/deny">
                      <button type="submit">Deny</button>
                    </form>
                  </div>
                </li>
              `;
            })
            .join("\n")
        : "<li>No pending approvals.</li>";

      const historyHtml = history.length
        ? history
            .slice(0, 100)
            .map((artifact) => {
              const jobId = artifact.job_id ?? "unknown";
              return `<li>${escapeHtml(artifact.type)} — ${escapeHtml(jobId)} — ${escapeHtml(
                artifact.created_at,
              )}</li>`;
            })
            .join("\n")
        : "<li>No approval history found.</li>";

      const html = `<!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Atlas Approval Timeline</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; margin: 24px; }
              h1 { margin-bottom: 8px; }
              h2 { margin-top: 24px; }
              ul { padding-left: 20px; }
              li { margin-bottom: 12px; }
              button { padding: 6px 12px; }
            </style>
          </head>
          <body>
            <h1>Approval Timeline</h1>
            <p>Pending approvals and recent decisions.</p>
            <h2>Pending</h2>
            <ul>${pendingHtml}</ul>
            <h2>History</h2>
            <ul>${historyHtml}</ul>
          </body>
        </html>`;

      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // GET /approvals.json
    if (path === "/approvals.json" && method === "GET") {
      const statusParam = url.searchParams.get("status") ?? "needs_approval";
      const workflowId = url.searchParams.get("workflow_id") ?? undefined;
      const since = url.searchParams.get("since") ?? undefined;
      const cursor = url.searchParams.get("cursor") ?? undefined;
      const limitParam = Number.parseInt(
        url.searchParams.get("limit") ?? "50",
        10,
      );
      const limit =
        Number.isFinite(limitParam) && limitParam > 0
          ? Math.min(200, limitParam)
          : 50;

      const jobLimit = Math.min(500, limit + 1);
      const allJobs =
        statusParam === "all"
          ? repo.listJobs({ limit: jobLimit, afterId: cursor })
          : repo.listJobs({
              status: statusParam as JobStatus,
              limit: jobLimit,
              afterId: cursor,
            });
      const filteredJobs = workflowId
        ? allJobs.filter((job) => job.workflow_id === workflowId)
        : allJobs;
      const hasMore = filteredJobs.length > limit;
      const pending = filteredJobs.slice(0, limit);
      const nextCursor = hasMore
        ? (pending[pending.length - 1]?.id ?? null)
        : null;

      const approvalRequests = repo.findArtifacts({
        type: "checkpoint.approval_request.v1",
        since,
        limit: Math.max(limit, 100),
      });
      const approvalGranted = repo.findArtifacts({
        type: "checkpoint.approval_granted.v1",
        since,
        limit: Math.max(limit, 100),
      });
      const approvalDenied = repo.findArtifacts({
        type: "checkpoint.approval_denied.v1",
        since,
        limit: Math.max(limit, 100),
      });

      const history = [
        ...approvalRequests,
        ...approvalGranted,
        ...approvalDenied,
      ]
        .filter((artifact) =>
          workflowId ? artifact.data?.workflow_id === workflowId : true,
        )
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, limit);

      const counts = repo.countJobsByStatus(
        workflowId ? { workflowId } : undefined,
      );

      const pendingWithRequests = pending.map((job) => {
        const request =
          approvalRequests.find((a) => a.job_id === job.id) ?? null;
        return {
          job,
          request,
        };
      });

      return jsonResponse({
        status: statusParam,
        workflow_id: workflowId ?? null,
        since: since ?? null,
        cursor: cursor ?? null,
        next_cursor: nextCursor,
        counts,
        pending: pendingWithRequests,
        history,
      });
    }

    // GET /artifacts/:id
    if (path.startsWith("/artifacts/") && method === "GET") {
      const id = path.split("/")[2];
      if (!id) {
        return jsonResponse({ error: "Invalid artifact ID" }, 400);
      }
      const artifact = repo.getArtifact(id);

      if (!artifact) {
        return jsonResponse({ error: "Artifact not found" }, 404);
      }

      return jsonResponse(artifact);
    }

    // GET /skills
    if (path === "/skills" && method === "GET") {
      const registry = await getSkillRegistry();
      const skills = registry.list();
      return jsonResponse({
        skills: skills.map((skill) => ({
          name: skill.name,
          description: skill.description ?? null,
          path: skill.path,
          allowedTools: skill.allowedTools ?? null,
        })),
      });
    }

    // GET /skills/:name
    if (path.startsWith("/skills/") && method === "GET") {
      const name = decodeURIComponent(path.split("/")[2] ?? "");
      if (!name) {
        return jsonResponse({ error: "Invalid skill name" }, 400);
      }
      const registry = await getSkillRegistry();
      const skill = registry.get(name);
      if (!skill) {
        return jsonResponse({ error: "Skill not found" }, 404);
      }
      return jsonResponse({
        name: skill.name,
        description: skill.description ?? null,
        path: skill.path,
        allowedTools: skill.allowedTools ?? null,
        content: skill.content,
        frontmatter: skill.frontmatter ?? null,
      });
    }

    // POST /maintenance/prune
    if (path === "/maintenance/prune" && method === "POST") {
      const body = (await req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      commands.enqueue({
        type: "maintenance.prune",
        policy: (body.policy as Record<string, unknown>) || {},
      });

      return jsonResponse({ status: "prune_scheduled" });
    }

    // GET /search
    if (path === "/search" && method === "GET") {
      const query = url.searchParams.get("q");
      if (!query) {
        return jsonResponse({ error: "Query parameter 'q' is required" }, 400);
      }

      const k = Math.min(
        Number.parseInt(url.searchParams.get("k") ?? "10", 10),
        100,
      );
      const type =
        (url.searchParams.get("type") as "artifact" | "entity" | null) ??
        "artifact";
      const since = url.searchParams.get("since") ?? undefined;

      try {
        // Build embedding router
        const { buildEmbeddingBackendRegistry } = await import(
          "../ai/provider_factory"
        );
        const { loadOrDefaultRoutingConfig } = await import("../config");
        const { EmbeddingRouterRuntime } = await import(
          "../routing/embedding_router"
        );
        const { cosineSimilarity, normalizeVector } = await import(
          "../ai/embedding_runtime"
        );

        const routingConfig = await loadOrDefaultRoutingConfig();
        const embeddingRegistry = await buildEmbeddingBackendRegistry();
        const embeddingRouter = new EmbeddingRouterRuntime(
          routingConfig.embeddings,
          embeddingRegistry,
        );

        // Embed the query
        const queryEmbed = await embeddingRouter.embedText({
          texts: [query],
          profile: "balanced",
        });
        const queryVector = normalizeVector(queryEmbed.vectors[0] ?? []);
        const queryDims = queryVector.length;

        if (queryDims === 0) {
          return jsonResponse({ error: "Failed to embed query" }, 500);
        }

        // Load candidate embeddings, filtering by matching dimension
        const allCandidates = repo.listEmbeddings({
          owner_type: type,
          since,
          limit: 1000,
        });
        const candidates = allCandidates.filter(
          (emb) => emb.dims === queryDims,
        );

        // Compute cosine similarity for each candidate
        const scored = candidates.map((emb) => ({
          embedding: emb,
          score: cosineSimilarity(queryVector, emb.vector),
        }));

        // Sort by score descending and take top k
        scored.sort((a, b) => b.score - a.score);
        const topK = scored.slice(0, k);

        // Fetch corresponding artifacts/entities
        const results = await Promise.all(
          topK.map(async ({ embedding, score }) => {
            let item: Artifact | Entity | null = null;
            if (embedding.owner_type === "artifact") {
              item = repo.getArtifact(embedding.owner_id);
            } else {
              item = repo.getEntity(embedding.owner_id);
            }
            return {
              score,
              embedding_id: embedding.id,
              owner_type: embedding.owner_type,
              owner_id: embedding.owner_id,
              item,
            };
          }),
        );

        // Filter out null items
        const validResults = results.filter((r) => r.item !== null);

        return jsonResponse({
          query,
          results: validResults,
          total_candidates: candidates.length,
          filtered_from: allCandidates.length,
          dims: queryDims,
          returned: validResults.length,
        });
      } catch (error) {
        logError("api.search_error", { error });
        return jsonResponse({ error: "Search failed" }, 500);
      }
    }

    // GET /api/v1/artifacts/:id/isc-report
    if (
      path.match(/^\/api\/v1\/artifacts\/[^/]+\/isc-report$/) &&
      method === "GET"
    ) {
      const id = path.split("/")[4];
      if (!id) {
        return jsonResponse({ error: "Invalid artifact ID" }, 400);
      }

      const artifact = repo.getArtifact(id);
      if (!artifact) {
        return jsonResponse({ error: "Artifact not found" }, 404);
      }

      // Query ISC report from database
      try {
        const { db } = await import("../core/db");
        interface ISCReportRow {
          criteria_results: string;
          anti_criteria_results: string;
          passed: number;
          [key: string]: unknown;
        }
        const report = db
          .prepare(
            "SELECT * FROM isc_reports WHERE artifact_id = ? ORDER BY created_at DESC LIMIT 1",
          )
          .get(id) as ISCReportRow | null;

        if (!report) {
          return jsonResponse(
            { error: "ISC report not found for artifact" },
            404,
          );
        }

        return jsonResponse({
          artifact_id: id,
          report: {
            ...report,
            criteria_results: JSON.parse(report.criteria_results),
            anti_criteria_results: JSON.parse(report.anti_criteria_results),
            passed: Boolean(report.passed),
          },
        });
      } catch (error) {
        logError("api.isc_report_error", { error });
        return jsonResponse({ error: "Failed to retrieve ISC report" }, 500);
      }
    }

    // GET /api/v1/artifacts/:id/prd
    if (path.match(/^\/api\/v1\/artifacts\/[^/]+\/prd$/) && method === "GET") {
      const id = path.split("/")[4];
      if (!id) {
        return jsonResponse({ error: "Invalid artifact ID" }, 400);
      }

      const artifact = repo.getArtifact(id);
      if (!artifact) {
        return jsonResponse({ error: "Artifact not found" }, 404);
      }

      // Read PRD from file system
      try {
        const { PRDStorage } = await import("../core/prd-storage");
        const prdStorage = new PRDStorage();
        const prd = prdStorage.read(id);

        if (!prd) {
          return jsonResponse({ error: "PRD not found for artifact" }, 404);
        }

        return jsonResponse({ prd });
      } catch (error) {
        logError("api.prd_error", { error });
        return jsonResponse({ error: "Failed to retrieve PRD" }, 500);
      }
    }

    // GET /api/v1/reflections
    if (path === "/api/v1/reflections" && method === "GET") {
      const workflowId = url.searchParams.get("workflow_id") ?? undefined;
      const since = url.searchParams.get("since") ?? undefined;
      const limitParam = Number.parseInt(
        url.searchParams.get("limit") ?? "50",
        10,
      );
      const limit =
        Number.isFinite(limitParam) && limitParam > 0
          ? Math.min(200, limitParam)
          : 50;

      try {
        const { db } = await import("../core/db");
        let query = "SELECT * FROM reflections WHERE 1=1";
        const params: (string | number)[] = [];

        if (workflowId) {
          query += " AND workflow_id = ?";
          params.push(workflowId);
        }

        if (since) {
          query += " AND timestamp > ?";
          params.push(since);
        }

        query += " ORDER BY timestamp DESC LIMIT ?";
        params.push(limit);

        const reflections = db.prepare(query).all(...params) as Record<
          string,
          unknown
        >[];

        return jsonResponse({
          reflections: reflections.map((r) => ({
            ...r,
            within_budget: Boolean(r.within_budget),
          })),
          count: reflections.length,
        });
      } catch (error) {
        logError("api.reflections_error", { error });
        return jsonResponse({ error: "Failed to retrieve reflections" }, 500);
      }
    }

    // GET /api/v1/workflows/:id/isc
    if (path.match(/^\/api\/v1\/workflows\/[^/]+\/isc$/) && method === "GET") {
      const workflowId = path.split("/")[4];
      if (!workflowId) {
        return jsonResponse({ error: "Invalid workflow ID" }, 400);
      }

      const workflow = registry.getWorkflow(workflowId);
      if (!workflow) {
        return jsonResponse({ error: "Workflow not found" }, 404);
      }

      // Return workflow's ISC definition if available
      const workflowWithISC = workflow as {
        isc?: import("../isc/types").ISCDefinition;
      };
      if (workflowWithISC.isc) {
        return jsonResponse({ isc: workflowWithISC.isc });
      }

      // Otherwise return empty
      return jsonResponse({ isc: null });
    }

    return jsonResponse({ error: "Not found" }, 404);
  };
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
