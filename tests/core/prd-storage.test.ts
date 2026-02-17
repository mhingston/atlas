import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { PRDStorage } from "../../src/core/prd-storage";
import type { PRD } from "../../src/types/prd";

const testDir = "/tmp/atlas-test-prds";

describe("PRDStorage", () => {
  let storage: PRDStorage;

  beforeAll(() => {
    // Setup test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });

    process.env.ATLAS_DB_PATH = join(testDir, "atlas.db");
    storage = new PRDStorage();
  });

  afterAll(() => {
    // Cleanup
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  const testPRD: PRD = {
    id: "PRD-20260217-test-artifact",
    artifactId: "art_test_123",
    workflowId: "test.workflow.v1",
    jobId: "job_test_456",
    status: "COMPLETE",
    effortLevel: "STANDARD",
    title: "Test Artifact",
    problemSpace: "Test problem space",
    keyFiles: ["file1.md", "file2.md"],
    constraints: ["Constraint 1", "Constraint 2"],
    decisions: [
      {
        date: "2026-02-17",
        decision: "Test decision",
        rationale: "Test rationale",
        alternatives: ["Alt 1", "Alt 2"],
      },
    ],
    idealCriteria: [
      {
        id: "ISC-TEST-001",
        criterion: "Test criterion",
        priority: "CRITICAL",
        confidence: "EXPLICIT",
        verify: { type: "GREP", pattern: "test" },
      },
    ],
    antiCriteria: [],
    iteration: 1,
    maxIterations: 10,
    lastPhase: "COMPLETE",
    failingCriteria: [],
    createdAt: "2026-02-17T00:00:00Z",
    updatedAt: "2026-02-17T00:00:00Z",
    log: [],
  };

  it("should create PRD markdown files", () => {
    storage.create(testPRD);
    const retrieved = storage.read(testPRD.artifactId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(testPRD.id);
  });

  it("should read PRD with correct frontmatter", () => {
    const retrieved = storage.read(testPRD.artifactId);
    // Frontmatter fields are properly parsed
    expect(retrieved?.id).toBe(testPRD.id);
    expect(retrieved?.artifactId).toBe(testPRD.artifactId);
    expect(retrieved?.status).toBe(testPRD.status);
    expect(retrieved?.effortLevel).toBe(testPRD.effortLevel);
    expect(retrieved?.workflowId).toBe(testPRD.workflowId);
    expect(retrieved?.jobId).toBe(testPRD.jobId);
    expect(retrieved?.iteration).toBe(testPRD.iteration);
    expect(retrieved?.maxIterations).toBe(testPRD.maxIterations);
  });

  it("should update PRD fields", () => {
    storage.update(testPRD.artifactId, { status: "IN_PROGRESS" });
    const retrieved = storage.read(testPRD.artifactId);
    expect(retrieved?.status).toBe("IN_PROGRESS");
  });

  it("should list all PRDs", () => {
    const list = storage.list();
    expect(list.length).toBeGreaterThan(0);
    expect(list).toContain(testPRD.artifactId);
  });

  it("should return null for non-existent PRD", () => {
    const result = storage.read("non-existent-artifact");
    expect(result).toBeNull();
  });

  it("should generate PRD IDs correctly", () => {
    const id = PRDStorage.generateId("my-test-slug");
    expect(id).toMatch(/^PRD-\d{8}-my-test-slug$/);
  });

  // Note: Full markdown parsing (title, log entries, etc.) is a known limitation
  // and is documented in the implementation summary
});
