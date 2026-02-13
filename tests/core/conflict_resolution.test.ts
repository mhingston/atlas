import { describe, expect, it } from "bun:test";
import {
  type ConflictResolutionPolicy,
  DEFAULT_POLICY,
  type FieldConflict,
  detectFieldConflicts,
  formatConflictReport,
  reconcileArtifacts,
  resolveFieldConflict,
} from "../../src/core/conflict_resolution";
import type { Artifact } from "../../src/core/types";

function createArtifact(
  id: string,
  overrides: Partial<Artifact> = {},
): Artifact {
  return {
    id,
    type: "test.artifact",
    job_id: "job_123",
    title: `Artifact ${id}`,
    content_md: `Content for ${id}`,
    data: {},
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("Conflict Resolution", () => {
  describe("DEFAULT_POLICY", () => {
    it("should have expected defaults", () => {
      expect(DEFAULT_POLICY.strategy).toBe("latest");
      expect(DEFAULT_POLICY.requireCitations).toBe(true);
      expect(DEFAULT_POLICY.allowUnresolved).toBe(true);
      expect(DEFAULT_POLICY.conflictThreshold).toBe(0.8);
      expect(DEFAULT_POLICY.generateDecisionLog).toBe(true);
      expect(DEFAULT_POLICY.autoResolveThreshold).toBe(0.9);
    });
  });

  describe("detectFieldConflicts", () => {
    it("should detect no conflicts when all values match", () => {
      const artifacts = [
        createArtifact("a1", { data: { status: "active" } }),
        createArtifact("a2", { data: { status: "active" } }),
        createArtifact("a3", { data: { status: "active" } }),
      ];

      const conflicts = detectFieldConflicts(
        artifacts,
        ["status"],
        DEFAULT_POLICY,
      );

      expect(conflicts).toHaveLength(0);
    });

    it("should detect conflicts when values differ", () => {
      const artifacts = [
        createArtifact("a1", { data: { status: "active" } }),
        createArtifact("a2", { data: { status: "inactive" } }),
        createArtifact("a3", { data: { status: "active" } }),
      ];

      const conflicts = detectFieldConflicts(
        artifacts,
        ["status"],
        DEFAULT_POLICY,
      );

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.field).toBe("status");
      expect(conflicts[0]?.values).toHaveLength(2);
    });

    it("should handle multiple fields", () => {
      const artifacts = [
        createArtifact("a1", { data: { status: "active", priority: "high" } }),
        createArtifact("a2", {
          data: { status: "inactive", priority: "low" },
        }),
      ];

      const conflicts = detectFieldConflicts(
        artifacts,
        ["status", "priority"],
        DEFAULT_POLICY,
      );

      expect(conflicts).toHaveLength(2);
    });

    it("should ignore undefined values", () => {
      const artifacts = [
        createArtifact("a1", { data: { status: "active" } }),
        createArtifact("a2", { data: {} }),
      ];

      const conflicts = detectFieldConflicts(
        artifacts,
        ["status"],
        DEFAULT_POLICY,
      );

      expect(conflicts).toHaveLength(0);
    });
  });

  describe("resolveFieldConflict", () => {
    it("should use latest strategy by default", () => {
      const conflict: FieldConflict = {
        field: "status",
        values: [
          {
            value: "old",
            sources: ["a1"],
            artifact: createArtifact("a1", {
              created_at: "2024-01-01T00:00:00Z",
            }),
          },
          {
            value: "new",
            sources: ["a2"],
            artifact: createArtifact("a2", {
              created_at: "2024-01-02T00:00:00Z",
            }),
          },
        ],
        resolutionStrategy: "latest",
        confidence: 0,
        isResolved: false,
        requiresManualReview: false,
      };

      const policy: ConflictResolutionPolicy = {
        ...DEFAULT_POLICY,
        autoResolveThreshold: 0.7,
      };
      const resolved = resolveFieldConflict(conflict, policy);

      expect(resolved.resolution).toBe("new");
      expect(resolved.confidence).toBe(0.8);
      expect(resolved.isResolved).toBe(true);
    });

    it("should use earliest strategy when specified", () => {
      const conflict: FieldConflict = {
        field: "status",
        values: [
          {
            value: "old",
            sources: ["a1"],
            artifact: createArtifact("a1", {
              created_at: "2024-01-01T00:00:00Z",
            }),
          },
          {
            value: "new",
            sources: ["a2"],
            artifact: createArtifact("a2", {
              created_at: "2024-01-02T00:00:00Z",
            }),
          },
        ],
        resolutionStrategy: "earliest",
        confidence: 0,
        isResolved: false,
        requiresManualReview: false,
      };

      const resolved = resolveFieldConflict(conflict, DEFAULT_POLICY);

      expect(resolved.resolution).toBe("old");
      expect(resolved.confidence).toBe(0.8);
    });

    it("should use majority vote strategy", () => {
      const conflict: FieldConflict = {
        field: "status",
        values: [
          {
            value: "common",
            sources: ["a1", "a2", "a3"],
            artifact: createArtifact("a1"),
          },
          {
            value: "rare",
            sources: ["a4"],
            artifact: createArtifact("a4"),
          },
        ],
        resolutionStrategy: "majority-vote",
        confidence: 0,
        isResolved: false,
        requiresManualReview: false,
      };

      const resolved = resolveFieldConflict(conflict, DEFAULT_POLICY);

      expect(resolved.resolution).toBe("common");
      expect(resolved.confidence).toBe(0.75);
    });

    it("should require manual review for manual strategy", () => {
      const conflict: FieldConflict = {
        field: "status",
        values: [
          {
            value: "active",
            sources: ["a1"],
            artifact: createArtifact("a1"),
          },
        ],
        resolutionStrategy: "manual",
        confidence: 0,
        isResolved: false,
        requiresManualReview: false,
      };

      const resolved = resolveFieldConflict(conflict, DEFAULT_POLICY);

      expect(resolved.requiresManualReview).toBe(true);
      expect(resolved.isResolved).toBe(false);
      expect(resolved.confidence).toBe(0);
    });

    it("should require manual review when confidence is below threshold", () => {
      const conflict: FieldConflict = {
        field: "status",
        values: [
          {
            value: "active",
            sources: ["a1"],
            artifact: createArtifact("a1"),
          },
        ],
        resolutionStrategy: "shortest",
        confidence: 0,
        isResolved: false,
        requiresManualReview: false,
      };

      const policy: ConflictResolutionPolicy = {
        ...DEFAULT_POLICY,
        autoResolveThreshold: 0.95,
      };

      const resolved = resolveFieldConflict(conflict, policy);

      expect(resolved.requiresManualReview).toBe(true);
    });

    it("should handle empty values array", () => {
      const conflict: FieldConflict = {
        field: "status",
        values: [],
        resolutionStrategy: "latest",
        confidence: 0,
        isResolved: false,
        requiresManualReview: false,
      };

      const resolved = resolveFieldConflict(conflict, DEFAULT_POLICY);

      expect(resolved.requiresManualReview).toBe(true);
      expect(resolved.isResolved).toBe(false);
    });
  });

  describe("reconcileArtifacts", () => {
    it("should return resolved status for single artifact", () => {
      const artifacts = [createArtifact("a1")];

      const report = reconcileArtifacts(artifacts, ["status"], DEFAULT_POLICY);

      expect(report.status).toBe("resolved");
      expect(report.conflicts).toHaveLength(0);
      expect(report.confidence).toBe(1);
    });

    it("should return resolved status when no conflicts detected", () => {
      const artifacts = [
        createArtifact("a1", { data: { status: "active" } }),
        createArtifact("a2", { data: { status: "active" } }),
      ];

      const report = reconcileArtifacts(artifacts, ["status"], DEFAULT_POLICY);

      expect(report.status).toBe("resolved");
      expect(report.conflicts).toHaveLength(0);
    });

    it("should detect and resolve conflicts", () => {
      const artifacts = [
        createArtifact("a1", {
          data: { status: "active" },
          created_at: "2024-01-01T00:00:00Z",
        }),
        createArtifact("a2", {
          data: { status: "inactive" },
          created_at: "2024-01-02T00:00:00Z",
        }),
      ];

      const policy: ConflictResolutionPolicy = {
        ...DEFAULT_POLICY,
        autoResolveThreshold: 0.7,
      };
      const report = reconcileArtifacts(artifacts, ["status"], policy);

      expect(report.status).toBe("resolved");
      expect(report.conflicts).toHaveLength(1);
      expect(report.requiresManualReview).toBe(false);
      expect(report.decisionLog).toHaveLength(1);
    });

    it("should generate decision log entries", () => {
      const artifacts = [
        createArtifact("a1", { data: { status: "active" } }),
        createArtifact("a2", { data: { status: "inactive" } }),
      ];

      const report = reconcileArtifacts(artifacts, ["status"], DEFAULT_POLICY);

      expect(report.decisionLog.length).toBeGreaterThan(0);
      expect(report.decisionLog[0]).toHaveProperty("conflict");
      expect(report.decisionLog[0]).toHaveProperty("decision");
      expect(report.decisionLog[0]).toHaveProperty("rationale");
      expect(report.decisionLog[0]).toHaveProperty("confidence");
    });
  });

  describe("formatConflictReport", () => {
    it("should format report as markdown", () => {
      const report = reconcileArtifacts(
        [
          createArtifact("a1", { data: { status: "active" } }),
          createArtifact("a2", { data: { status: "inactive" } }),
        ],
        ["status"],
        DEFAULT_POLICY,
      );

      const markdown = formatConflictReport(report);

      expect(markdown).toContain("# Conflict Resolution Report");
      expect(markdown).toContain("Status:");
      expect(markdown).toContain("Confidence:");
    });

    it("should handle resolved status", () => {
      const report = reconcileArtifacts(
        [createArtifact("a1", { data: { status: "active" } })],
        ["status"],
        DEFAULT_POLICY,
      );

      const markdown = formatConflictReport(report);

      expect(markdown).toContain("resolved");
      expect(markdown).toContain("100%");
    });
  });
});
