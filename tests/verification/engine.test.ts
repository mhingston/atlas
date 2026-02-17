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
        passed: true,
        evidence: "Mock evaluation passed",
        actualValue: "test",
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

const testISC: ISCDefinition = {
  artifactType: "test.artifact",
  version: "1.0.0",
  idealCriteria: [
    {
      id: "ISC-TEST-001",
      criterion: "Contains word count",
      priority: "CRITICAL",
      confidence: "EXPLICIT",
      verify: { type: "CLI", command: "wc -w" },
    },
    {
      id: "ISC-TEST-002",
      criterion: "Has markdown headers",
      priority: "IMPORTANT",
      confidence: "EXPLICIT",
      verify: { type: "GREP", pattern: "^#+ " },
    },
    {
      id: "ISC-TEST-003",
      criterion: "Custom check",
      priority: "NICE",
      confidence: "INFERRED",
      verify: { type: "CUSTOM", description: "Check quality" },
    },
  ],
  antiCriteria: [
    {
      id: "ISC-A-TEST-001",
      criterion: "No empty content",
      priority: "CRITICAL",
      verify: { type: "GREP", pattern: ".+" },
    },
  ],
  minCriteria: 2,
  scaleTier: "SIMPLE",
};

const testArtifact: Artifact = {
  id: "art_test_123",
  type: "test.artifact",
  job_id: null,
  title: "Test Artifact",
  content_md: "# Heading\n\nThis is test content with multiple words here.",
  data: {},
  created_at: new Date().toISOString(),
};

// Import VerificationEngine after setting up test environment
async function createTestEngine(testDb: Database) {
  const { VerificationEngine } = await import("../../src/verification/engine");
  return new VerificationEngine(mockLLM, mockRepo, testDb);
}

describe("VerificationEngine", () => {
  let engine: VerificationEngine;
  let testDb: Database;
  const testDir = "/tmp/atlas-test-engine";

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

  it("should verify CLI criterion", async () => {
    const result = await engine.verify(
      { type: "CLI", command: "wc -w" },
      testArtifact,
      "ISC-TEST-001",
    );
    expect(result.criterionId).toBe("ISC-TEST-001");
    expect(result.passed).toBe(true);
    expect(result.evidence).toBeTruthy(); // CLI returns word count as evidence
    expect(result.durationMs).toBeGreaterThanOrEqual(0); // Can be 0 for very fast operations
  });

  it("should verify Grep criterion", async () => {
    const result = await engine.verify(
      { type: "GREP", pattern: "^#+ " },
      testArtifact,
      "ISC-TEST-002",
    );
    expect(result.criterionId).toBe("ISC-TEST-002");
    expect(result.passed).toBe(true);
    expect(result.evidence).toContain("Found");
    expect(result.durationMs).toBeGreaterThanOrEqual(0); // Can be 0 for very fast operations
  });

  it("should verify Custom criterion with LLM", async () => {
    const result = await engine.verify(
      { type: "CUSTOM", description: "Check quality" },
      testArtifact,
      "ISC-TEST-003",
    );
    expect(result.criterionId).toBe("ISC-TEST-003");
    expect(result.passed).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0); // Can be 0 for very fast operations
  });

  it("should verify all criteria in parallel", async () => {
    const report = await engine.verifyAllCriteria(
      testISC,
      testArtifact,
      "job_test_123",
      "workflow_test",
    );
    expect(report.artifactId).toBe(testArtifact.id);
    expect(report.artifactType).toBe(testArtifact.type);
    expect(report.criteriaResults).toHaveLength(3);
    expect(report.antiCriteriaResults).toHaveLength(1);
    expect(report.passed).toBe(true);
    expect(report.summary).toContain("criteria");
  });

  it("should fail when CRITICAL criteria fail", async () => {
    const failingArtifact: Artifact = {
      ...testArtifact,
      content_md: "", // Empty content will fail CLI and Grep
    };

    const failingISC: ISCDefinition = {
      ...testISC,
      idealCriteria: [
        {
          ...testISC.idealCriteria[0],
          verify: { type: "GREP", pattern: "this-will-not-match" },
        },
      ],
    };

    const report = await engine.verifyAllCriteria(
      failingISC,
      failingArtifact,
      "job_test_124",
      "workflow_test",
    );
    expect(report.passed).toBe(false);
  });
});
