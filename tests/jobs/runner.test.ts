import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CommandQueue } from "../../src/core/queue";
import { ReadOnlyRepo } from "../../src/core/repo";
import { runOnce } from "../../src/jobs/runner";
import { PluginRegistry } from "../../src/plugins/registry";
import type { WorkflowPlugin } from "../../src/plugins/types";
import { runTestMigrations } from "../helpers/fixtures";

function insertQueuedJob(db: Database, id: string, workflowId: string) {
  db.prepare(
    "INSERT INTO jobs (id,workflow_id,status,input_json,started_at,finished_at,log_json) VALUES (?,?,?,?,?,?,?)",
  ).run(id, workflowId, "queued", "{}", null, null, null);
}

describe("runner default approval policy", () => {
  let db: Database;
  let repo: ReadOnlyRepo;
  let commands: CommandQueue;
  let registry: PluginRegistry;
  let envSnapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    envSnapshot = { ...process.env };
    db = new Database(":memory:");
    runTestMigrations(db);
    repo = new ReadOnlyRepo(db);
    commands = new CommandQueue();
    registry = new PluginRegistry();
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in envSnapshot)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(envSnapshot)) {
      process.env[key] = value;
    }
    db.close();
  });

  test("sets needs_approval and emits checkpoint when default policy enabled", async () => {
    process.env.ATLAS_REQUIRE_APPROVAL_BY_DEFAULT = "true";

    const workflow: WorkflowPlugin = {
      id: "simple.v1",
      async run(ctx, _input, jobId) {
        ctx.emitArtifact({
          type: "simple.output.v1",
          job_id: jobId,
          title: "Output",
          content_md: "ok",
          data: { schema_version: "1" },
        });
      },
    };

    registry.registerWorkflow(workflow);
    insertQueuedJob(db, "job_simple_1", "simple.v1");

    await runOnce(registry, repo, commands);

    const enqueued = commands.drain(20);
    expect(
      enqueued.some(
        (cmd) =>
          cmd.type === "job.updateStatus" && cmd.status === "needs_approval",
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
});
