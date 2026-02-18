import type { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { createFetchHandler } from "../../src/api/server";
import { CommandQueue } from "../../src/core/queue";
import { ReadOnlyRepo } from "../../src/core/repo";
import { Writer } from "../../src/core/writer";
import { FlushLoop } from "../../src/jobs/loop";
import { Scheduler } from "../../src/jobs/scheduler";
import { PluginRegistry } from "../../src/plugins/registry";
import {
  createTestDb,
  dbHelpers,
  fixtures,
  runTestMigrations,
} from "../helpers/fixtures";

describe("API Server", () => {
  let db: Database;
  let handler: (req: Request) => Promise<Response>;
  type ArtifactsResponse = {
    artifacts: Array<{ type: string; job_id?: string | null }>;
  };

  function assertArtifactsResponse(
    data: unknown,
  ): asserts data is ArtifactsResponse {
    expect(data).toBeTruthy();
    if (!data || typeof data !== "object") {
      throw new Error("Expected object response");
    }
    const artifacts = (data as { artifacts?: unknown }).artifacts;
    expect(Array.isArray(artifacts)).toBe(true);
  }

  async function request(path: string, init?: RequestInit) {
    const url = `http://localhost${path}`;
    const req = new Request(url, init);
    return handler(req);
  }

  let flushLoop: FlushLoop;
  let scheduler: Scheduler;
  let commands: CommandQueue;

  // Helper to wait for all pending commands to be processed
  async function waitForPendingCommands(timeoutMs = 5000): Promise<void> {
    const startTime = Date.now();
    while (commands.size() > 0 && Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    // Give a bit more time for the database to commit
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  beforeAll(() => {
    db = createTestDb();
    runTestMigrations(db);

    const registry = new PluginRegistry();
    const repo = new ReadOnlyRepo(db);
    commands = new CommandQueue();
    const writer = new Writer(db);
    flushLoop = new FlushLoop(commands, writer, 100);
    flushLoop.start();

    // Start scheduler to process jobs for OpenAI API tests
    scheduler = new Scheduler(registry, repo, commands, 100);
    scheduler.start();

    handler = createFetchHandler(registry, repo, commands, flushLoop);
  });

  afterAll(() => {
    scheduler.stop();
    flushLoop.stop();
    db.close();
  });

  describe("GET /health", () => {
    test("should return 200 with status ok", async () => {
      const res = await request("/health");
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("ok");
    });
  });

  describe("POST /jobs", () => {
    test("should create job and return 200", async () => {
      const res = await request("/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow_id: "test.workflow.v1",
          input: { topic: "testing" },
        }),
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.job_id).toBeDefined();
      expect(data.status).toBe("queued");
    });

    test("should return 400 when workflow_id missing", async () => {
      const res = await request("/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: {} }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("workflow_id");
    });
  });

  describe("GET /jobs/:id", () => {
    test("should return job when exists", async () => {
      const job = fixtures.job({ id: "job_api_test123" });
      dbHelpers.insertJob(db, job);

      const res = await request("/jobs/job_api_test123");
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.id).toBe("job_api_test123");
      expect(data.workflow_id).toBe(job.workflow_id);
    });

    test("should return 404 when job not found", async () => {
      const res = await request("/jobs/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /jobs/:id/approve", () => {
    test("should return 400 when status not needs_approval", async () => {
      const job = fixtures.job({
        id: "job_approve_not_needed",
        status: "queued",
      });
      dbHelpers.insertJob(db, job);

      const res = await request(`/jobs/${job.id}/approve`, { method: "POST" });
      expect(res.status).toBe(400);
    });

    test("should return 404 when approval artifact missing", async () => {
      const job = fixtures.job({
        id: "job_approve_missing",
        status: "needs_approval",
      });
      dbHelpers.insertJob(db, job);

      const res = await request(`/jobs/${job.id}/approve`, { method: "POST" });
      expect(res.status).toBe(404);
    });

    test("should approve and enqueue follow-on job when recommended", async () => {
      const job = fixtures.job({
        id: "job_approve_ok",
        status: "needs_approval",
      });
      dbHelpers.insertJob(db, job);

      db.prepare(
        "INSERT INTO artifacts (id,type,job_id,title,content_md,data_json,created_at) VALUES (?,?,?,?,?,?,?)",
      ).run(
        "art_approve_1",
        "checkpoint.approval_request.v1",
        job.id,
        "Approval Request",
        null,
        JSON.stringify({
          recommended_next_job: {
            workflow_id: "followup.workflow.v1",
            input: { goal: "next" },
          },
        }),
        new Date().toISOString(),
      );

      const res = await request(`/jobs/${job.id}/approve`, { method: "POST" });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("approved");
      expect(data.next_job_id).toBeDefined();
    });
  });

  describe("POST /jobs/:id/deny", () => {
    test("should deny when needs_approval", async () => {
      const job = fixtures.job({
        id: "job_deny_ok",
        status: "needs_approval",
      });
      dbHelpers.insertJob(db, job);

      const res = await request(`/jobs/${job.id}/deny`, { method: "POST" });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("denied");
    });
  });

  describe("GET /artifacts", () => {
    test("should return all artifacts", async () => {
      dbHelpers.insertArtifact(db, fixtures.artifact());
      dbHelpers.insertArtifact(db, fixtures.artifact());

      const res = await request("/artifacts");
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.artifacts).toBeArray();
      expect(data.artifacts.length).toBeGreaterThanOrEqual(2);
    });

    test("should filter by type", async () => {
      dbHelpers.insertArtifact(
        db,
        fixtures.artifact({ type: "specific.type.v1" }),
      );

      const res = await request("/artifacts?type=specific.type.v1");
      const data = await res.json();
      assertArtifactsResponse(data);

      expect(res.status).toBe(200);
      expect(data.artifacts.every((a) => a.type === "specific.type.v1")).toBe(
        true,
      );
    });

    test("should filter by job_id", async () => {
      const jobId = "job_filter_test";
      dbHelpers.insertArtifact(db, fixtures.artifact({ job_id: jobId }));

      const res = await request(`/artifacts?job_id=${jobId}`);
      const data = await res.json();
      assertArtifactsResponse(data);

      expect(res.status).toBe(200);
      expect(data.artifacts.some((a) => a.job_id === jobId)).toBe(true);
    });

    test("should respect limit parameter", async () => {
      for (let i = 0; i < 10; i++) {
        dbHelpers.insertArtifact(db, fixtures.artifact());
      }

      const res = await request("/artifacts?limit=3");
      const data = await res.json();

      expect(data.artifacts.length).toBeLessThanOrEqual(3);
    });
  });

  describe("GET /approvals", () => {
    test("should render HTML with pending approvals", async () => {
      const job = fixtures.job({
        id: "job_pending_1",
        status: "needs_approval",
      });
      dbHelpers.insertJob(db, job);
      dbHelpers.insertArtifact(
        db,
        fixtures.artifact({
          id: "art_approval_req",
          job_id: job.id,
          type: "checkpoint.approval_request.v1",
          content_md: "Please review",
        }),
      );

      const res = await request("/approvals");
      const text = await res.text();

      expect(res.status).toBe(200);
      expect(text).toContain("Approval Timeline");
      expect(text).toContain(job.id);
      expect(text).toContain("Approve");
      expect(text).toContain("Deny");
    });
  });

  describe("GET /approvals.json", () => {
    test("should return filtered approvals data", async () => {
      const job = fixtures.job({
        id: "job_pending_json",
        status: "needs_approval",
        workflow_id: "wf.json",
      });
      dbHelpers.insertJob(db, job);

      dbHelpers.insertArtifact(
        db,
        fixtures.artifact({
          id: "art_req_json",
          job_id: job.id,
          type: "checkpoint.approval_request.v1",
          data: { workflow_id: job.workflow_id },
        }),
      );

      const res = await request(
        `/approvals.json?status=needs_approval&workflow_id=${job.workflow_id}`,
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.pending.length).toBe(1);
      expect(data.pending[0].job.id).toBe(job.id);
      expect(data.history.length).toBeGreaterThan(0);
      expect(data.counts.needs_approval).toBeGreaterThanOrEqual(1);
    });

    test("should include pagination cursor", async () => {
      for (let i = 0; i < 3; i++) {
        dbHelpers.insertJob(
          db,
          fixtures.job({
            id: `job_page_${i}`,
            status: "needs_approval",
          }),
        );
      }

      const res = await request(
        "/approvals.json?status=needs_approval&limit=1",
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.pending.length).toBe(1);
      expect(data.next_cursor).toBeTruthy();
    });
  });

  describe("GET /search", () => {
    test("should return 400 when missing query", async () => {
      const res = await request("/search");
      expect(res.status).toBe(400);
    });

    test("should return results for matching embeddings", async () => {
      const originalCwd = process.cwd();
      const tempDir = `/tmp/atlas-test-${Date.now()}`;
      await mkdir(tempDir, { recursive: true });
      process.chdir(tempDir);

      try {
        const artifact = fixtures.artifact({
          id: "art_search_1",
          content_md: "Searchable content",
        });
        dbHelpers.insertArtifact(db, artifact);

        db.prepare(
          "INSERT INTO embeddings (id, owner_type, owner_id, provider, model, dims, vector_json, content_hash, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ).run(
          "emb_search_1",
          "artifact",
          artifact.id,
          "mock",
          "mock-embedding",
          384,
          JSON.stringify(Array.from({ length: 384 }, () => 0.01)),
          "hash",
          new Date().toISOString(),
          new Date().toISOString(),
        );

        const res = await request("/search?q=search");
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.results.length).toBeGreaterThan(0);
        expect(data.results[0].owner_id).toBe(artifact.id);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe("GET /artifacts/:id", () => {
    test("should return artifact when exists", async () => {
      const artifact = fixtures.artifact({ id: "art_api_test123" });
      dbHelpers.insertArtifact(db, artifact);

      const res = await request("/artifacts/art_api_test123");
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.id).toBe("art_api_test123");
      expect(data.type).toBe(artifact.type);
    });

    test("should return 404 when artifact not found", async () => {
      const res = await request("/artifacts/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /sync", () => {
    test("should trigger sync and return 200", async () => {
      const res = await request("/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.status).toBe("sync_triggered");
    });

    test("should accept specific source IDs", async () => {
      const res = await request("/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: ["mock.source"] }),
      });

      expect(res.status).toBe(200);
    });
  });

  describe("POST /maintenance/prune", () => {
    test("should schedule prune operation", async () => {
      const res = await request("/maintenance/prune", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policy: { retain_days: 30, max_artifacts: 1000 },
        }),
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.status).toBe("prune_scheduled");
    });
  });

  describe("OpenAI API", () => {
    describe("GET /v1/models", () => {
      test("should return list of models", async () => {
        const res = await request("/v1/models");
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.object).toBe("list");
        expect(data.data).toBeArray();
        expect(data.data.length).toBeGreaterThanOrEqual(3);
        expect(
          data.data.some((m: { id: string }) => m.id === "atlas-scratchpad"),
        ).toBe(true);
        expect(
          data.data.some((m: { id: string }) => m.id === "atlas-brainstorm"),
        ).toBe(true);
        expect(
          data.data.some((m: { id: string }) => m.id === "atlas-code"),
        ).toBe(true);
      });
    });

    describe("POST /v1/chat/completions", () => {
      test("should create chat completion job", async () => {
        const res = await request("/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "atlas-scratchpad",
            messages: [{ role: "user", content: "Test message" }],
          }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.id).toBeDefined();
        expect(data.object).toBe("chat.completion");
        expect(data.model).toBe("atlas-scratchpad");
        expect(data.choices).toBeArray();
        expect(data.choices.length).toBe(1);
        expect(data.choices[0].message.role).toBe("assistant");
        expect(data.choices[0].message.content).toBeDefined();
        expect(data.usage).toBeDefined();
        expect(data.usage.prompt_tokens).toBeGreaterThanOrEqual(0);
        expect(data.usage.completion_tokens).toBeGreaterThanOrEqual(0);
        expect(data.usage.total_tokens).toBeGreaterThanOrEqual(0);

        // Wait for pending commands to complete to avoid test interference
        await waitForPendingCommands();
      });

      test("should return 400 when model missing", async () => {
        const res = await request("/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: "Test" }],
          }),
        });

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain("model");
      });

      test("should return 400 when messages missing", async () => {
        const res = await request("/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "atlas-scratchpad",
          }),
        });

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain("messages");
      });

      test("should return 400 when messages empty", async () => {
        const res = await request("/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "atlas-scratchpad",
            messages: [],
          }),
        });

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain("messages");
      });

      test("should route to brainstorm workflow", async () => {
        const res = await request("/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "atlas-brainstorm",
            messages: [{ role: "user", content: "Brainstorm ideas" }],
          }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.model).toBe("atlas-brainstorm");

        // Wait for pending commands to complete to avoid test interference
        await waitForPendingCommands();
      });

      test("should auto-route to brainstorm based on content", async () => {
        const res = await request("/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "atlas-scratchpad",
            messages: [
              { role: "user", content: "Brainstorm ideas for my app" },
            ],
          }),
        });

        expect(res.status).toBe(200);
        // Even with atlas-scratchpad model, "brainstorm" in content routes to brainstorm.v1
        // The response should still be returned
        const data = await res.json();
        expect(data.choices[0].message.content).toBeDefined();

        // Wait for pending commands to complete to avoid test interference
        await waitForPendingCommands();
      });

      test("should auto-route to code workflow based on content", async () => {
        const res = await request("/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "atlas-scratchpad",
            messages: [{ role: "user", content: "Help me refactor this code" }],
          }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.choices[0].message.content).toBeDefined();

        // Wait for pending commands to complete to avoid test interference
        await waitForPendingCommands();
      });

      test("should support conversation_id", async () => {
        const res = await request("/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "atlas-scratchpad",
            messages: [{ role: "user", content: "Test" }],
            conversation_id: "conv_test_123",
          }),
        });

        expect(res.status).toBe(200);

        // Wait for pending commands to complete to avoid test interference
        await waitForPendingCommands();
      });

      test("should handle invalid JSON", async () => {
        const res = await request("/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "invalid json",
        });

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBe("Invalid JSON body");
      });
    });
  });
});
