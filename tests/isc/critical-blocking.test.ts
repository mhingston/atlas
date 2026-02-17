import { Database } from "bun:sqlite";
import { beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { LLMRuntime } from "../../src/ai/llm_runtime";
import type { ReadOnlyRepo } from "../../src/core/repo";
import type { Artifact } from "../../src/core/types";
import type { ISCDefinition } from "../../src/isc/types";

const mockLLM: LLMRuntime = {
  async generateText() {
    return {
      text: JSON.stringify({
        passed: false,
        evidence: "Mock evaluation failed",
      }),
      provider: "mock",
    };
  },
};

const mockRepo: ReadOnlyRepo = {
  getArtifact: () => null,
  getEntity: () => null,
  getEmbeddingsByOwner: () => [],
  listJobs: () => [],
  listEntities: () => [],
  findArtifacts: () => [],
  listEmbeddings: () => [],
  getJob: () => null,
  countJobsByStatus: () => ({}),
  listTraceEvents: () => [],
};

// ISC with failing CRITICAL criterion
const failingISC: ISCDefinition = {
  artifactType: "test.critical",
  version: "1.0.0",
  idealCriteria: [
    {
      id: "ISC-CRIT-001",
      criterion: "Must have content",
      priority: "CRITICAL",
      confidence: "EXPLICIT",
      verify: { type: "GREP", pattern: "this-will-never-match" },
    },
    {
      id: "ISC-IMP-001",
      criterion: "Should have structure",
      priority: "IMPORTANT",
      confidence: "EXPLICIT",
      verify: { type: "GREP", pattern: "# " },
    },
  ],
  antiCriteria: [],
  minCriteria: 2,
  scaleTier: "SIMPLE",
};

// ISC with passing CRITICAL criterion
const passingISC: ISCDefinition = {
  artifactType: "test.critical.pass",
  version: "1.0.0",
  idealCriteria: [
    {
      id: "ISC-CRIT-002",
      criterion: "Must have content",
      priority: "CRITICAL",
      confidence: "EXPLICIT",
      verify: { type: "GREP", pattern: "content" },
    },
  ],
  antiCriteria: [],
  minCriteria: 1,
  scaleTier: "SIMPLE",
};

const testArtifact: Artifact = {
  id: "art_crit_123",
  type: "test.critical",
  job_id: "job_crit_123",
  title: "Critical Test",
  content_md: "Some content here",
  data: {},
  created_at: new Date().toISOString(),
};

// Import VerificationEngine after setting up test environment
async function createTestEngine(testDb: Database) {
  const { VerificationEngine } = await import("../../src/verification/engine");
  return new VerificationEngine(mockLLM, mockRepo, testDb);
}

describe("CRITICAL Criterion Blocking", () => {
  let engine: VerificationEngine;
  let testDb: Database;
  const testDir = "/tmp/atlas-test-critical";

  beforeAll(async () => {
    // Setup test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });

    // Create test database
    const dbPath = join(testDir, "test.db");
    testDb = new Database(dbPath, { create: true });

    // Run migrations
    testDb.run(`
      CREATE TABLE IF NOT EXISTS isc_reports (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        artifact_type TEXT NOT NULL,
        passed INTEGER NOT NULL,
        criteria_results TEXT NOT NULL,
        anti_criteria_results TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    engine = await createTestEngine(testDb);
  });

  it("should mark report as failed when CRITICAL criterion fails", async () => {
    const report = await engine.verifyAllCriteria(
      failingISC,
      testArtifact,
      "job_crit_123",
      "workflow_test",
    );

    expect(report.passed).toBe(false);
    expect(report.criteriaResults).toHaveLength(2);

    // Check that CRITICAL criterion failed
    const criticalResult = report.criteriaResults.find(
      (r) => r.criterionId === "ISC-CRIT-001",
    );
    expect(criticalResult?.passed).toBe(false);
  });

  it("should pass when all CRITICAL criteria pass", async () => {
    const report = await engine.verifyAllCriteria(
      passingISC,
      testArtifact,
      "job_crit_124",
      "workflow_test",
    );

    expect(report.passed).toBe(true);
    expect(report.criteriaResults).toHaveLength(1);
    expect(report.criteriaResults[0].passed).toBe(true);
  });

  it("should include failing criteria in report", async () => {
    const report = await engine.verifyAllCriteria(
      failingISC,
      testArtifact,
      "job_crit_125",
      "workflow_test",
    );

    // Should identify the critical failure
    const criticalFailures = report.criteriaResults.filter((r) => {
      const criterion = failingISC.idealCriteria.find(
        (c) => c.id === r.criterionId,
      );
      return !r.passed && criterion?.priority === "CRITICAL";
    });

    expect(criticalFailures).toHaveLength(1);
    expect(criticalFailures[0].criterionId).toBe("ISC-CRIT-001");
  });

  it("should store report in database", async () => {
    const report = await engine.verifyAllCriteria(
      passingISC,
      testArtifact,
      "job_crit_126",
      "workflow_test",
    );

    // Query database to verify storage
    const stored = testDb
      .prepare("SELECT * FROM isc_reports WHERE id = ?")
      .get(report.id) as { passed: number; artifact_id: string };

    expect(stored).toBeDefined();
    expect(stored.passed).toBe(1);
    expect(stored.artifact_id).toBe(testArtifact.id);
  });
});
