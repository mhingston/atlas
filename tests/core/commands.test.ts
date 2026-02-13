import { beforeEach, describe, expect, test } from "bun:test";
import { CommandQueue } from "../../src/core/queue";

describe("CommandQueue", () => {
  let queue: CommandQueue;

  beforeEach(() => {
    queue = new CommandQueue();
  });

  describe("enqueue", () => {
    test("should add command to queue", () => {
      queue.enqueue({
        type: "job.create",
        job: { id: "job_test", workflow_id: "test.v1", input: {} },
      });
      expect(queue.size()).toBe(1);
    });

    test("should maintain insertion order", () => {
      queue.enqueue({
        type: "job.create",
        job: { id: "job_test", workflow_id: "test1.v1", input: {} },
      });
      queue.enqueue({
        type: "job.create",
        job: { id: "job_test", workflow_id: "test2.v1", input: {} },
      });

      const commands = queue.drain(10);
      expect(commands[0].job.workflow_id).toBe("test1.v1");
      expect(commands[1].job.workflow_id).toBe("test2.v1");
    });

    test("should handle multiple command types", () => {
      queue.enqueue({
        type: "job.create",
        job: { id: "job_test", workflow_id: "test.v1", input: {} },
      });
      queue.enqueue({
        type: "job.update_status",
        id: "job_123",
        status: "running",
        timestamp: "2024-01-01",
      });
      queue.enqueue({
        type: "artifact.create",
        artifact: { type: "test.v1", data: {} },
      });

      expect(queue.size()).toBe(3);
    });
  });

  describe("drain", () => {
    test("should return empty array when queue is empty", () => {
      const commands = queue.drain(10);
      expect(commands).toEqual([]);
      expect(queue.size()).toBe(0);
    });

    test("should return all commands when count exceeds size", () => {
      queue.enqueue({
        type: "job.create",
        job: { id: "job_test", workflow_id: "test.v1", input: {} },
      });
      queue.enqueue({
        type: "job.create",
        job: { id: "job_test", workflow_id: "test.v1", input: {} },
      });

      const commands = queue.drain(100);
      expect(commands.length).toBe(2);
      expect(queue.size()).toBe(0);
    });

    test("should return exactly count commands when specified", () => {
      for (let i = 0; i < 5; i++) {
        queue.enqueue({
          type: "job.create",
          job: { id: "job_test", workflow_id: `test${i}.v1`, input: {} },
        });
      }

      const commands = queue.drain(3);
      expect(commands.length).toBe(3);
      expect(queue.size()).toBe(2);
    });

    test("should remove drained commands from queue", () => {
      queue.enqueue({
        type: "job.create",
        job: { id: "job_test", workflow_id: "test1.v1", input: {} },
      });
      queue.enqueue({
        type: "job.create",
        job: { id: "job_test", workflow_id: "test2.v1", input: {} },
      });

      queue.drain(1);
      expect(queue.size()).toBe(1);

      const remaining = queue.drain(10);
      expect(remaining[0].job.workflow_id).toBe("test2.v1");
    });
  });

  describe("size", () => {
    test("should return 0 for empty queue", () => {
      expect(queue.size()).toBe(0);
    });

    test("should return correct count after enqueue", () => {
      queue.enqueue({
        type: "job.create",
        job: { id: "job_test", workflow_id: "test.v1", input: {} },
      });
      expect(queue.size()).toBe(1);

      queue.enqueue({
        type: "job.create",
        job: { id: "job_test", workflow_id: "test.v1", input: {} },
      });
      expect(queue.size()).toBe(2);
    });

    test("should return correct count after drain", () => {
      for (let i = 0; i < 10; i++) {
        queue.enqueue({
          type: "job.create",
          job: { id: "job_test", workflow_id: "test.v1", input: {} },
        });
      }

      queue.drain(3);
      expect(queue.size()).toBe(7);
    });
  });

  describe("batch operations", () => {
    test("should handle rapid enqueue/drain cycles", () => {
      for (let i = 0; i < 100; i++) {
        queue.enqueue({
          type: "job.create",
          job: { id: "job_test", workflow_id: "test.v1", input: {} },
        });
      }

      const batch1 = queue.drain(50);
      expect(batch1.length).toBe(50);

      const batch2 = queue.drain(50);
      expect(batch2.length).toBe(50);

      expect(queue.size()).toBe(0);
    });
  });
});
