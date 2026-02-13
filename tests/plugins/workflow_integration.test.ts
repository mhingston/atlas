import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runMigrations } from "../../src/core/db";
import { CommandQueue } from "../../src/core/queue";
import { ReadOnlyRepo } from "../../src/core/repo";
import { Writer } from "../../src/core/writer";
import { PluginRegistry } from "../../src/plugins/registry";
import type { WorkflowContext } from "../../src/plugins/types";
import { brainstormWorkflow } from "../../src/plugins/workflows/brainstorm";
import { codeAssistWorkflow } from "../../src/plugins/workflows/code_assist";
import { codePipelineWorkflow } from "../../src/plugins/workflows/code_pipeline";
import { codeReviewWorkflow } from "../../src/plugins/workflows/code_review";
import { curateArtifactsWorkflow } from "../../src/plugins/workflows/curate_artifacts";
import { curateMergeApplyWorkflow } from "../../src/plugins/workflows/curate_merge_apply";
import { digestDailyWorkflow } from "../../src/plugins/workflows/digest_daily";
import { digestWeeklyWorkflow } from "../../src/plugins/workflows/digest_weekly";

describe("Workflow Integration", () => {
  let db: Database;
  let _writer: Writer;
  let commands: CommandQueue;
  let repo: ReadOnlyRepo;
  let registry: PluginRegistry;
  type EmitArtifactInput = Parameters<WorkflowContext["emitArtifact"]>[0];
  type FindArtifactsQuery = Parameters<WorkflowContext["findArtifacts"]>[0];

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    _writer = new Writer(db);
    commands = new CommandQueue();
    repo = new ReadOnlyRepo(db);
    registry = new PluginRegistry();

    registry.registerWorkflow(brainstormWorkflow);
    registry.registerWorkflow(codeAssistWorkflow);
    registry.registerWorkflow(codePipelineWorkflow);
    registry.registerWorkflow(codeReviewWorkflow);
    registry.registerWorkflow(digestDailyWorkflow);
    registry.registerWorkflow(digestWeeklyWorkflow);
    registry.registerWorkflow(curateArtifactsWorkflow);
    registry.registerWorkflow(curateMergeApplyWorkflow);
  });

  afterEach(() => {
    db.close();
  });

  describe("brainstorm.v1 with new LLMRuntime", () => {
    test("should execute successfully with mock provider", async () => {
      // Import runtime factories
      const { loadLLMRuntime } = await import("../../src/ai/provider_factory");
      const { GatedLLMRuntime } = await import(
        "../../src/ai/gated_llm_runtime"
      );
      const { createDefaultWorkflowPolicy } = await import(
        "../../src/core/policy"
      );

      // Create context
      const policy = createDefaultWorkflowPolicy();
      const llmRuntime = await loadLLMRuntime();
      const gatedLLM = new GatedLLMRuntime(llmRuntime, policy);

      const ctx = {
        repo,
        commands,
        llm: gatedLLM,
        nowIso: () => new Date().toISOString(),
        emitArtifact(a: EmitArtifactInput) {
          commands.enqueue({
            type: "artifact.create",
            artifact: a,
          });
        },
        spawnJob() {
          return { jobId: "job_test" };
        },
        findArtifacts() {
          return [];
        },
      };

      // Execute workflow
      await brainstormWorkflow.run(ctx, { topic: "test" }, "job_123");

      // Verify artifact was emitted
      const enqueued = commands.drain(10);
      expect(enqueued.length).toBe(1);
      expect(enqueued[0].type).toBe("artifact.create");
      expect(enqueued[0].artifact.type).toBe("brainstorm.session.v1");
      expect(enqueued[0].artifact.data.llm_provider).toBe("mock");
    });
  });

  describe("code.assist.v1 with HarnessRuntime", () => {
    test("should handle missing harness gracefully", async () => {
      const { loadLLMRuntime } = await import("../../src/ai/provider_factory");
      const { GatedLLMRuntime } = await import(
        "../../src/ai/gated_llm_runtime"
      );
      const { createDefaultWorkflowPolicy } = await import(
        "../../src/core/policy"
      );

      const policy = createDefaultWorkflowPolicy();
      const llmRuntime = await loadLLMRuntime();
      const gatedLLM = new GatedLLMRuntime(llmRuntime, policy);

      const ctx = {
        repo,
        commands,
        llm: gatedLLM,
        harness: undefined, // No harness
        nowIso: () => new Date().toISOString(),
        emitArtifact(a: EmitArtifactInput) {
          commands.enqueue({
            type: "artifact.create",
            artifact: a,
          });
        },
        spawnJob() {
          return { jobId: "job_test" };
        },
        findArtifacts() {
          return [];
        },
      };

      // Execute workflow
      await codeAssistWorkflow.run(ctx, { goal: "test" }, "job_456");

      // Should emit error artifact
      const enqueued = commands.drain(10);
      expect(enqueued.length).toBe(1);
      expect(enqueued[0].artifact.type).toBe("code.error.v1");
    });

    test("should execute with NoopHarnessRuntime", async () => {
      const { loadLLMRuntime } = await import("../../src/ai/provider_factory");
      const { GatedLLMRuntime } = await import(
        "../../src/ai/gated_llm_runtime"
      );
      const { createDefaultWorkflowPolicy } = await import(
        "../../src/core/policy"
      );
      const { NoopHarnessRuntime } = await import(
        "../../src/harness/impl/noop_harness"
      );

      const policy = createDefaultWorkflowPolicy();
      const llmRuntime = await loadLLMRuntime();
      const gatedLLM = new GatedLLMRuntime(llmRuntime, policy);
      const harness = new NoopHarnessRuntime();

      const ctx = {
        repo,
        commands,
        llm: gatedLLM,
        harness,
        nowIso: () => new Date().toISOString(),
        emitArtifact(a: EmitArtifactInput) {
          commands.enqueue({
            type: "artifact.create",
            artifact: a,
          });
        },
        spawnJob() {
          return { jobId: "job_test" };
        },
        findArtifacts() {
          return [];
        },
      };

      // Execute workflow
      await codeAssistWorkflow.run(ctx, { goal: "test goal" }, "job_789");

      // Should emit artifacts from harness outputs
      const enqueued = commands.drain(10);
      expect(enqueued.length).toBeGreaterThan(0);

      const types = enqueued.map((cmd) => cmd.artifact.type);
      expect(types).toContain("code.summary.v1");
      expect(types).toContain("code.plan.v1");
    });
  });

  describe("code.review.v1 with explicit approval", () => {
    test("should emit review artifact and set needs_approval status", async () => {
      const { loadLLMRuntime } = await import("../../src/ai/provider_factory");
      const { GatedLLMRuntime } = await import(
        "../../src/ai/gated_llm_runtime"
      );
      const { createDefaultWorkflowPolicy } = await import(
        "../../src/core/policy"
      );
      const { NoopHarnessRuntime } = await import(
        "../../src/harness/impl/noop_harness"
      );

      const policy = createDefaultWorkflowPolicy();
      const llmRuntime = await loadLLMRuntime();
      const gatedLLM = new GatedLLMRuntime(llmRuntime, policy);
      const harness = new NoopHarnessRuntime();

      const ctx = {
        repo,
        commands,
        llm: gatedLLM,
        harness,
        nowIso: () => new Date().toISOString(),
        emitArtifact(a: EmitArtifactInput) {
          commands.enqueue({
            type: "artifact.create",
            artifact: a,
          });
        },
        spawnJob() {
          return { jobId: "job_test" };
        },
        findArtifacts() {
          return [];
        },
      };

      await codeReviewWorkflow.run(ctx, { goal: "review test" }, "job_900");

      const enqueued = commands.drain(20);
      const types = enqueued
        .filter((cmd) => cmd.type === "artifact.create")
        .map((cmd) => cmd.artifact.type);

      expect(types).toContain("code.review.v1");
      expect(
        enqueued.some(
          (cmd) =>
            cmd.type === "job.updateStatus" && cmd.status === "needs_approval",
        ),
      ).toBe(true);
    });
  });

  describe("code.pipeline.v1", () => {
    test("should emit review artifact and set needs_approval status", async () => {
      const { loadLLMRuntime } = await import("../../src/ai/provider_factory");
      const { GatedLLMRuntime } = await import(
        "../../src/ai/gated_llm_runtime"
      );
      const { createDefaultWorkflowPolicy } = await import(
        "../../src/core/policy"
      );
      const { NoopHarnessRuntime } = await import(
        "../../src/harness/impl/noop_harness"
      );

      const policy = createDefaultWorkflowPolicy();
      const llmRuntime = await loadLLMRuntime();
      const gatedLLM = new GatedLLMRuntime(llmRuntime, policy);
      const harness = new NoopHarnessRuntime();

      const ctx = {
        repo,
        commands,
        llm: gatedLLM,
        harness,
        nowIso: () => new Date().toISOString(),
        emitArtifact(a: EmitArtifactInput) {
          commands.enqueue({
            type: "artifact.create",
            artifact: a,
          });
        },
        spawnJob() {
          return { jobId: "job_test" };
        },
        findArtifacts() {
          return [];
        },
      };

      await codePipelineWorkflow.run(ctx, { goal: "pipeline test" }, "job_910");

      const enqueued = commands.drain(20);
      const types = enqueued
        .filter((cmd) => cmd.type === "artifact.create")
        .map((cmd) => cmd.artifact.type);

      expect(types).toContain("code.review.v1");
      expect(
        enqueued.some(
          (cmd) =>
            cmd.type === "job.updateStatus" && cmd.status === "needs_approval",
        ),
      ).toBe(true);
    });
  });

  describe("digest.weekly.v1 with embeddings", () => {
    test("should emit digest artifact using embedding retrieval", async () => {
      const { loadLLMRuntime } = await import("../../src/ai/provider_factory");
      const { GatedLLMRuntime } = await import(
        "../../src/ai/gated_llm_runtime"
      );
      const { createDefaultWorkflowPolicy } = await import(
        "../../src/core/policy"
      );
      const { MockEmbeddingRuntime } = await import(
        "../../src/ai/embedding_runtime"
      );

      const policy = createDefaultWorkflowPolicy();
      const llmRuntime = await loadLLMRuntime();
      const gatedLLM = new GatedLLMRuntime(llmRuntime, policy);
      const embeddings = new MockEmbeddingRuntime();

      const now = new Date().toISOString();
      const since = new Date(Date.now() - 60 * 1000).toISOString();
      const vector = Array.from({ length: 384 }, () => 0.01);

      db.prepare(
        "INSERT INTO artifacts (id, type, job_id, title, content_md, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run("art_1", "note.v1", null, "Test Note", "Some content", "{}", now);

      db.prepare(
        "INSERT INTO embeddings (id, owner_type, owner_id, provider, model, dims, vector_json, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        "emb_1",
        "artifact",
        "art_1",
        "mock",
        "mock-embedding",
        384,
        JSON.stringify(vector),
        "hash",
        now,
        now,
      );

      const ctx = {
        repo,
        commands,
        llm: gatedLLM,
        embeddings,
        nowIso: () => new Date().toISOString(),
        emitArtifact(a: EmitArtifactInput) {
          commands.enqueue({
            type: "artifact.create",
            artifact: a,
          });
        },
        spawnJob() {
          return { jobId: "job_test" };
        },
        findArtifacts() {
          return [];
        },
      };

      await digestWeeklyWorkflow.run(ctx, { query: "test", since }, "job_901");

      const enqueued = commands.drain(10);
      const types = enqueued
        .filter((cmd) => cmd.type === "artifact.create")
        .map((cmd) => cmd.artifact.type);
      expect(types).toContain("digest.weekly.v1");
    });
  });

  describe("digest.daily.v1 (deterministic)", () => {
    test("should emit digest artifact without LLM usage", async () => {
      const { loadLLMRuntime } = await import("../../src/ai/provider_factory");
      const { GatedLLMRuntime } = await import(
        "../../src/ai/gated_llm_runtime"
      );
      const { createDefaultWorkflowPolicy } = await import(
        "../../src/core/policy"
      );

      const policy = createDefaultWorkflowPolicy();
      const llmRuntime = await loadLLMRuntime();
      const gatedLLM = new GatedLLMRuntime(llmRuntime, policy);

      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO artifacts (id, type, job_id, title, content_md, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run("art_daily_1", "note.v1", null, "Daily Note", "Content", "{}", now);

      const ctx = {
        repo,
        commands,
        llm: gatedLLM,
        nowIso: () => new Date().toISOString(),
        emitArtifact(a: EmitArtifactInput) {
          commands.enqueue({
            type: "artifact.create",
            artifact: a,
          });
        },
        spawnJob() {
          return { jobId: "job_test" };
        },
        findArtifacts() {
          return [];
        },
      };

      await digestDailyWorkflow.run(ctx, { limit: 10 }, "job_902");

      const enqueued = commands.drain(10);
      const digest = enqueued.find(
        (cmd) =>
          cmd.type === "artifact.create" &&
          cmd.artifact.type === "digest.daily.v1",
      );

      expect(digest).toBeTruthy();
      expect(digest?.artifact.data.returned).toBe(1);
    });
  });

  describe("curate.artifacts.v1", () => {
    test("should promote artifacts into canonical note", async () => {
      const { loadLLMRuntime } = await import("../../src/ai/provider_factory");
      const { GatedLLMRuntime } = await import(
        "../../src/ai/gated_llm_runtime"
      );
      const { createDefaultWorkflowPolicy } = await import(
        "../../src/core/policy"
      );

      const policy = createDefaultWorkflowPolicy();
      const llmRuntime = await loadLLMRuntime();
      const gatedLLM = new GatedLLMRuntime(llmRuntime, policy);

      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO artifacts (id, type, job_id, title, content_md, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run("art_a", "note.v1", null, "A", "Alpha", "{}", now);
      db.prepare(
        "INSERT INTO artifacts (id, type, job_id, title, content_md, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run("art_b", "note.v1", null, "B", "Beta", "{}", now);

      const ctx = {
        repo,
        commands,
        llm: gatedLLM,
        nowIso: () => new Date().toISOString(),
        emitArtifact(a: EmitArtifactInput) {
          commands.enqueue({
            type: "artifact.create",
            artifact: a,
          });
        },
        spawnJob() {
          return { jobId: "job_test" };
        },
        findArtifacts() {
          return [];
        },
      };

      await curateArtifactsWorkflow.run(
        ctx,
        {
          action: "promote",
          sourceIds: ["art_a", "art_b"],
          title: "Canonical",
        },
        "job_777",
      );

      const enqueued = commands.drain(10);
      expect(
        enqueued.some(
          (cmd) =>
            cmd.type === "artifact.create" &&
            cmd.artifact.type === "note.canonical.v1",
        ),
      ).toBe(true);
    });

    test("should emit dedupe report", async () => {
      const { loadLLMRuntime } = await import("../../src/ai/provider_factory");
      const { GatedLLMRuntime } = await import(
        "../../src/ai/gated_llm_runtime"
      );
      const { createDefaultWorkflowPolicy } = await import(
        "../../src/core/policy"
      );

      const policy = createDefaultWorkflowPolicy();
      const llmRuntime = await loadLLMRuntime();
      const gatedLLM = new GatedLLMRuntime(llmRuntime, policy);

      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO artifacts (id, type, job_id, title, content_md, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run("art_dup_1", "note.v1", null, "Same Title", "One", "{}", now);
      db.prepare(
        "INSERT INTO artifacts (id, type, job_id, title, content_md, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run("art_dup_2", "note.v1", null, "Same Title", "Two", "{}", now);

      const ctx = {
        repo,
        commands,
        llm: gatedLLM,
        nowIso: () => new Date().toISOString(),
        emitArtifact(a: EmitArtifactInput) {
          commands.enqueue({
            type: "artifact.create",
            artifact: a,
          });
        },
        spawnJob() {
          return { jobId: "job_test" };
        },
        findArtifacts(query: FindArtifactsQuery) {
          return repo.findArtifacts(query);
        },
      };

      await curateArtifactsWorkflow.run(
        ctx,
        { action: "dedupe", limit: 10 },
        "job_778",
      );

      const enqueued = commands.drain(10);
      expect(
        enqueued.some(
          (cmd) =>
            cmd.type === "artifact.create" &&
            cmd.artifact.type === "curation.dedupe.v1",
        ),
      ).toBe(true);
    });

    test("should emit embedding-based dedupe report", async () => {
      const { loadLLMRuntime } = await import("../../src/ai/provider_factory");
      const { GatedLLMRuntime } = await import(
        "../../src/ai/gated_llm_runtime"
      );
      const { createDefaultWorkflowPolicy } = await import(
        "../../src/core/policy"
      );

      const policy = createDefaultWorkflowPolicy();
      const llmRuntime = await loadLLMRuntime();
      const gatedLLM = new GatedLLMRuntime(llmRuntime, policy);

      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO artifacts (id, type, job_id, title, content_md, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run("art_emb_1", "note.v1", null, "Alpha", "One", "{}", now);
      db.prepare(
        "INSERT INTO artifacts (id, type, job_id, title, content_md, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run("art_emb_2", "note.v1", null, "Beta", "Two", "{}", now);

      const vector = Array.from({ length: 8 }, () => 0.5);
      db.prepare(
        "INSERT INTO embeddings (id, owner_type, owner_id, provider, model, dims, vector_json, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        "emb_e1",
        "artifact",
        "art_emb_1",
        "mock",
        "mock-embedding",
        8,
        JSON.stringify(vector),
        "hash1",
        now,
        now,
      );
      db.prepare(
        "INSERT INTO embeddings (id, owner_type, owner_id, provider, model, dims, vector_json, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        "emb_e2",
        "artifact",
        "art_emb_2",
        "mock",
        "mock-embedding",
        8,
        JSON.stringify(vector),
        "hash2",
        now,
        now,
      );

      const ctx = {
        repo,
        commands,
        llm: gatedLLM,
        nowIso: () => new Date().toISOString(),
        emitArtifact(a: EmitArtifactInput) {
          commands.enqueue({
            type: "artifact.create",
            artifact: a,
          });
        },
        spawnJob() {
          return { jobId: "job_test" };
        },
        findArtifacts(query: FindArtifactsQuery) {
          return repo.findArtifacts(query);
        },
      };

      await curateArtifactsWorkflow.run(
        ctx,
        {
          action: "dedupe",
          dedupeMode: "embedding",
          similarityThreshold: 0.8,
          limit: 10,
        },
        "job_779",
      );

      const enqueued = commands.drain(10);
      const dedupe = enqueued.find(
        (cmd) =>
          cmd.type === "artifact.create" &&
          cmd.artifact.type === "curation.dedupe.v1",
      );
      expect(dedupe).toBeTruthy();
      expect(dedupe?.artifact.data.dedupe_mode).toBe("embedding");
    });

    test("should suggest merge artifacts for embedding dedupe", async () => {
      const { loadLLMRuntime } = await import("../../src/ai/provider_factory");
      const { GatedLLMRuntime } = await import(
        "../../src/ai/gated_llm_runtime"
      );
      const { createDefaultWorkflowPolicy } = await import(
        "../../src/core/policy"
      );

      const policy = createDefaultWorkflowPolicy();
      const llmRuntime = await loadLLMRuntime();
      const gatedLLM = new GatedLLMRuntime(llmRuntime, policy);

      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO artifacts (id, type, job_id, title, content_md, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run("art_merge_1", "note.v1", null, "Alpha", "One", "{}", now);
      db.prepare(
        "INSERT INTO artifacts (id, type, job_id, title, content_md, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run("art_merge_2", "note.v1", null, "Beta", "Two", "{}", now);

      const vector = Array.from({ length: 8 }, () => 0.5);
      db.prepare(
        "INSERT INTO embeddings (id, owner_type, owner_id, provider, model, dims, vector_json, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        "emb_m1",
        "artifact",
        "art_merge_1",
        "mock",
        "mock-embedding",
        8,
        JSON.stringify(vector),
        "hash1",
        now,
        now,
      );
      db.prepare(
        "INSERT INTO embeddings (id, owner_type, owner_id, provider, model, dims, vector_json, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        "emb_m2",
        "artifact",
        "art_merge_2",
        "mock",
        "mock-embedding",
        8,
        JSON.stringify(vector),
        "hash2",
        now,
        now,
      );

      const ctx = {
        repo,
        commands,
        llm: gatedLLM,
        nowIso: () => new Date().toISOString(),
        emitArtifact(a: EmitArtifactInput) {
          commands.enqueue({
            type: "artifact.create",
            artifact: a,
          });
        },
        spawnJob() {
          return { jobId: "job_test" };
        },
        findArtifacts(query: FindArtifactsQuery) {
          return repo.findArtifacts(query);
        },
      };

      await curateArtifactsWorkflow.run(
        ctx,
        {
          action: "dedupe",
          dedupeMode: "embedding",
          similarityThreshold: 0.8,
          suggestMerge: true,
          limit: 10,
        },
        "job_780",
      );

      const enqueued = commands.drain(20);
      expect(
        enqueued.some(
          (cmd) =>
            cmd.type === "artifact.create" &&
            cmd.artifact.type === "curation.merge.suggestion.v1",
        ),
      ).toBe(true);
      expect(
        enqueued.some(
          (cmd) =>
            cmd.type === "artifact.create" &&
            cmd.artifact.type === "checkpoint.approval_request.v1",
        ),
      ).toBe(true);
    });

    test("should apply approved merge", async () => {
      const { loadLLMRuntime } = await import("../../src/ai/provider_factory");
      const { GatedLLMRuntime } = await import(
        "../../src/ai/gated_llm_runtime"
      );
      const { createDefaultWorkflowPolicy } = await import(
        "../../src/core/policy"
      );

      const policy = createDefaultWorkflowPolicy();
      const llmRuntime = await loadLLMRuntime();
      const gatedLLM = new GatedLLMRuntime(llmRuntime, policy);

      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO artifacts (id, type, job_id, title, content_md, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run("art_apply_1", "note.v1", null, "Alpha", "One", "{}", now);
      db.prepare(
        "INSERT INTO artifacts (id, type, job_id, title, content_md, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run("art_apply_2", "note.v1", null, "Beta", "Two", "{}", now);

      const ctx = {
        repo,
        commands,
        llm: gatedLLM,
        nowIso: () => new Date().toISOString(),
        emitArtifact(a: EmitArtifactInput) {
          commands.enqueue({
            type: "artifact.create",
            artifact: a,
          });
        },
        spawnJob() {
          return { jobId: "job_test" };
        },
        findArtifacts() {
          return [];
        },
      };

      await curateMergeApplyWorkflow.run(
        ctx,
        {
          sourceIds: ["art_apply_1", "art_apply_2"],
          title: "Merged Note",
          supersede: true,
        },
        "job_781",
      );

      const enqueued = commands.drain(10);
      expect(
        enqueued.some(
          (cmd) =>
            cmd.type === "artifact.create" &&
            cmd.artifact.type === "note.canonical.v1",
        ),
      ).toBe(true);
      expect(
        enqueued.some(
          (cmd) =>
            cmd.type === "artifact.create" &&
            cmd.artifact.type === "curation.supersedes.v1",
        ),
      ).toBe(true);
    });
  });
});
