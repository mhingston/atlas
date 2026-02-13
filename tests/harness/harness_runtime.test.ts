import { describe, expect, test } from "bun:test";
import { NoopHarnessRuntime } from "../../src/harness/impl/noop_harness";

describe("HarnessRuntime", () => {
  describe("NoopHarnessRuntime", () => {
    test("should return not configured message", async () => {
      const harness = new NoopHarnessRuntime();

      const result = await harness.runTask({
        harnessId: "test-harness",
        goal: "Test goal",
        cwd: "/tmp",
        mode: "propose",
      });

      expect(result.summary).toBe("Harness not configured");
      expect(result.outputs).toHaveLength(1);
      expect(result.outputs[0].type).toBe("text");
    });

    test("should respect mode parameter", async () => {
      const harness = new NoopHarnessRuntime();

      const result = await harness.runTask({
        harnessId: "test",
        goal: "Test",
        cwd: "/tmp",
        mode: "plan",
      });

      expect(result.mode).toBe("plan");
    });

    test("should default to propose mode", async () => {
      const harness = new NoopHarnessRuntime();

      const result = await harness.runTask({
        harnessId: "test",
        goal: "Test",
        cwd: "/tmp",
      });

      expect(result.mode).toBe("propose");
    });

    test("should include harness metadata", async () => {
      const harness = new NoopHarnessRuntime();

      const result = await harness.runTask({
        harnessId: "my-harness",
        goal: "Test",
        cwd: "/tmp",
      });

      expect(result.meta?.harnessId).toBe("my-harness");
      expect(result.meta?.reason).toBe("not_configured");
    });
  });
});
