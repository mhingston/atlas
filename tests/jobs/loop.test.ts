import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ulid } from "ulid";
import { CommandQueue } from "../../src/core/queue";
import { Writer } from "../../src/core/writer";
import { FlushLoop } from "../../src/jobs/loop";
import { getCount } from "../helpers/db";
import { createTestDb, runTestMigrations } from "../helpers/fixtures";

describe("FlushLoop", () => {
  let db: Database;
  let commands: CommandQueue;
  let writer: Writer;
  let loop: FlushLoop;

  beforeEach(() => {
    db = createTestDb();
    runTestMigrations(db);
    commands = new CommandQueue();
    writer = new Writer(db);
    loop = new FlushLoop(commands, writer, 100); // batch size 100
  });

  afterEach(() => {
    loop.stop();
  });

  describe("start and stop", () => {
    test("should start loop successfully", () => {
      expect(() => loop.start()).not.toThrow();
    });

    test("should stop loop successfully", () => {
      loop.start();
      expect(() => loop.stop()).not.toThrow();
    });

    test("should be safe to call stop multiple times", () => {
      loop.start();
      loop.stop();
      expect(() => loop.stop()).not.toThrow();
    });
  });

  describe("flushOnce", () => {
    test("should flush pending commands", () => {
      commands.enqueue({
        type: "job.create",
        job: { id: `job_${ulid()}`, workflow_id: "test.v1", input: {} },
      });

      loop.flushOnce();

      const jobs = db.query("SELECT * FROM jobs").all();
      expect(jobs.length).toBeGreaterThan(0);
    });

    test("should handle empty queue", () => {
      expect(() => loop.flushOnce()).not.toThrow();
    });

    test("should respect batch size", () => {
      // Add more commands than batch size
      for (let i = 0; i < 150; i++) {
        commands.enqueue({
          type: "job.create",
          job: { id: `job_${ulid()}`, workflow_id: `test${i}.v1`, input: {} },
        });
      }

      loop.flushOnce();

      // Should have drained exactly 100 (batch size)
      expect(commands.size()).toBe(50);
    });

    test("should process all commands with multiple flushes", () => {
      for (let i = 0; i < 250; i++) {
        commands.enqueue({
          type: "job.create",
          job: { id: `job_${ulid()}`, workflow_id: `test${i}.v1`, input: {} },
        });
      }

      loop.flushOnce(); // First 100
      loop.flushOnce(); // Next 100
      loop.flushOnce(); // Remaining 50

      expect(commands.size()).toBe(0);

      expect(getCount(db, "SELECT COUNT(*) as count FROM jobs")).toBe(250);
    });
  });

  describe("integration", () => {
    test("should flush commands automatically when started", async () => {
      commands.enqueue({
        type: "job.create",
        job: { id: `job_${ulid()}`, workflow_id: "auto.test.v1", input: {} },
      });

      loop.start();

      // Wait a bit for automatic flush
      await new Promise((resolve) => setTimeout(resolve, 50));

      const jobs = db
        .query("SELECT * FROM jobs WHERE workflow_id = ?")
        .all("auto.test.v1");
      expect(jobs.length).toBeGreaterThan(0);

      loop.stop();
    });

    test("should continue flushing while running", async () => {
      loop.start();

      // Add commands after start
      for (let i = 0; i < 10; i++) {
        commands.enqueue({
          type: "job.create",
          job: {
            id: `job_${ulid()}`,
            workflow_id: `runtime${i}.v1`,
            input: {},
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(
        getCount(db, "SELECT COUNT(*) as count FROM jobs"),
      ).toBeGreaterThanOrEqual(10);

      loop.stop();
    });
  });
});
