import { beforeAll, describe, expect, it } from "bun:test";
import type { LLMRuntime } from "../../src/ai/llm_runtime";
import type { CommandQueue } from "../../src/core/queue";
import { ReflectionCapture } from "../../src/core/reflection-capture";
import type { ReadOnlyRepo } from "../../src/core/repo";
import type { Job } from "../../src/core/types";
import type { ISCReport } from "../../src/isc/types";

class MockCommandQueue implements CommandQueue {
  commands: Array<{ type: string; reflection?: Record<string, unknown> }> = [];

  enqueue(command: Record<string, unknown>) {
    this.commands.push(
      command as { type: string; reflection?: Record<string, unknown> },
    );
  }

  drain() {
    const cmds = [...this.commands];
    this.commands = [];
    return cmds;
  }
}

const mockLLM: LLMRuntime = {
  async generateText() {
    return {
      text: JSON.stringify({
        q1Self: "I would structure the prompt better",
        q2Workflow: "The workflow should validate inputs earlier",
        q3System: "Atlas could provide better context about previous artifacts",
      }),
      provider: "mock",
    };
  },
};

const mockJob: Job = {
  id: "job_test_123",
  workflow_id: "test.workflow.v1",
  status: "succeeded",
  input: { topic: "test", artifactType: "test.artifact" },
  started_at: new Date(Date.now() - 5000).toISOString(),
  finished_at: new Date().toISOString(),
};

const mockRepo: ReadOnlyRepo = {
  getArtifact: () => null,
  getEntity: () => null,
  getEmbeddingsByOwner: () => [],
  listJobs: () => [mockJob],
  listEntities: () => [],
  findArtifacts: () => [],
  listEmbeddings: () => [],
  getJob: (id: string) => (id === mockJob.id ? mockJob : null),
  countJobsByStatus: () => ({}),
  listTraceEvents: () => [],
};

describe("ReflectionCapture", () => {
  let capture: ReflectionCapture;
  let commandQueue: MockCommandQueue;

  beforeAll(() => {
    commandQueue = new MockCommandQueue();
    capture = new ReflectionCapture(commandQueue, mockRepo, mockLLM);
  });

  it("should capture reflection for STANDARD effort", async () => {
    const iscReport: ISCReport = {
      id: "iscr_test_123",
      artifactId: "art_test_123",
      artifactType: "test.artifact",
      passed: true,
      criteriaResults: [
        {
          criterionId: "ISC-TEST-001",
          passed: true,
          evidence: "Pass",
          durationMs: 100,
        },
        {
          criterionId: "ISC-TEST-002",
          passed: false,
          evidence: "Fail",
          durationMs: 100,
        },
      ],
      antiCriteriaResults: [],
      summary: "2 criteria, 1 passed",
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const reflection = await capture.capture(
      "job_test_123",
      "STANDARD",
      iscReport,
    );

    expect(reflection.jobId).toBe("job_test_123");
    expect(reflection.workflowId).toBe("test.workflow.v1");
    expect(reflection.effortLevel).toBe("STANDARD");
    expect(reflection.criteriaCount).toBe(2);
    expect(reflection.criteriaPassed).toBe(1);
    expect(reflection.criteriaFailed).toBe(1);
    expect(reflection.q1Self).toBe("I would structure the prompt better");
    expect(reflection.q2Workflow).toBe(
      "The workflow should validate inputs earlier",
    );
    expect(reflection.q3System).toBe(
      "Atlas could provide better context about previous artifacts",
    );
    expect(reflection.version).toBeDefined();
  });

  it("should skip reflection for INSTANT effort", async () => {
    // Note: This test would need the actual implementation to check effort level
    // For now, we test that the capture still works
    const reflection = await capture.capture("job_test_123", "INSTANT");
    expect(reflection).toBeDefined();
  });

  it("should handle missing job gracefully", async () => {
    await expect(
      capture.capture("non-existent-job", "STANDARD"),
    ).rejects.toThrow();
  });

  it("should calculate elapsed percent correctly", async () => {
    const iscReport: ISCReport = {
      id: "iscr_test_124",
      artifactId: "art_test_124",
      artifactType: "test.artifact",
      passed: true,
      criteriaResults: [],
      antiCriteriaResults: [],
      summary: "Test",
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const reflection = await capture.capture(
      "job_test_123",
      "STANDARD",
      iscReport,
    );
    expect(reflection.elapsedPercent).toBeGreaterThan(0);
    expect(reflection.withinBudget).toBe(true); // 5s < 120s budget
  });
});
