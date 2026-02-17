import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Artifact } from "../../src/core/types";
import type { VerificationMethod } from "../../src/isc/types";
import { ReadVerifier } from "../../src/verification/verifiers/read";

const testDir = "/tmp/atlas-test-read-verifier";

describe("ReadVerifier", () => {
  let verifier: ReadVerifier;

  beforeAll(() => {
    // Setup test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });

    verifier = new ReadVerifier();
  });

  afterAll(() => {
    // Cleanup
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  const testArtifact: Artifact = {
    id: "art_test_123",
    type: "test.artifact",
    job_id: null,
    title: "Test Artifact",
    content_md: "This is test content for verification",
    data: {},
    created_at: new Date().toISOString(),
  };

  it("should pass when file exists and contains content", async () => {
    const filePath = join(testDir, "test-file.txt");
    writeFileSync(filePath, "This is test content for verification", "utf-8");

    const method: Extract<VerificationMethod, { type: "READ" }> = {
      type: "READ",
      path: filePath,
    };

    const result = await verifier.verify(method, testArtifact);

    expect(result.criterionId).toBe("");
    expect(result.passed).toBe(true);
    expect(result.evidence).toBe("File contains expected content");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.actualValue).toContain("File size:");
  });

  it("should fail when file does not exist", async () => {
    const method: Extract<VerificationMethod, { type: "READ" }> = {
      type: "READ",
      path: "/nonexistent/path/file.txt",
    };

    const result = await verifier.verify(method, testArtifact);

    expect(result.passed).toBe(false);
    expect(result.evidence).toContain("File not found");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should fail when file does not contain expected content", async () => {
    const filePath = join(testDir, "mismatched-file.txt");
    writeFileSync(filePath, "Completely different content here", "utf-8");

    const method: Extract<VerificationMethod, { type: "READ" }> = {
      type: "READ",
      path: filePath,
    };

    const result = await verifier.verify(method, testArtifact);

    expect(result.passed).toBe(false);
    expect(result.evidence).toBe("File does not contain expected content");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should pass when artifact has no content (file existence check)", async () => {
    const filePath = join(testDir, "exists-only.txt");
    writeFileSync(filePath, "Any content", "utf-8");

    const artifactNoContent: Artifact = {
      ...testArtifact,
      content_md: undefined,
    };

    const method: Extract<VerificationMethod, { type: "READ" }> = {
      type: "READ",
      path: filePath,
    };

    const result = await verifier.verify(method, artifactNoContent);

    expect(result.passed).toBe(true);
    expect(result.evidence).toBe(`File exists: ${filePath}`);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should handle errors gracefully", async () => {
    // Create a file path that will cause an error (e.g., a directory instead of a file)
    const method: Extract<VerificationMethod, { type: "READ" }> = {
      type: "READ",
      path: testDir, // This is a directory
    };

    const result = await verifier.verify(method, testArtifact);

    expect(result.passed).toBe(false);
    expect(result.evidence).toContain("Error reading file:");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should return actual file size", async () => {
    const filePath = join(testDir, "size-check.txt");
    const content = "This is some content";
    writeFileSync(filePath, content, "utf-8");

    const method: Extract<VerificationMethod, { type: "READ" }> = {
      type: "READ",
      path: filePath,
    };

    const result = await verifier.verify(method, testArtifact);

    expect(result.actualValue).toContain("File size:");
    expect(result.actualValue).toContain(String(content.length));
  });
});
