/**
 * Conflict Resolution Policies for Curation Workflows
 *
 * This module provides structured conflict resolution strategies for reconciling
 * artifacts with conflicting or contradictory information. It supports both
 * automatic resolution and human-in-the-loop approval workflows.
 */

import type { Artifact } from "./types";

export type ResolutionStrategy =
  | "latest" // Prefer most recently created
  | "earliest" // Prefer oldest/first created
  | "longest" // Prefer artifact with most content
  | "shortest" // Prefer most concise artifact
  | "source-priority" // Prefer based on source ranking
  | "majority-vote" // Prefer value that appears most frequently
  | "consensus" // Only accept if all sources agree
  | "manual"; // Always require human review

export interface ConflictResolutionPolicy {
  /** Primary resolution strategy */
  strategy: ResolutionStrategy;

  /** Source priority order (for source-priority strategy) */
  sourcePriority?: string[];

  /** Field-specific policies for structured data */
  fieldPolicies?: Record<string, ResolutionStrategy>;

  /** Whether to require citations in resolved output */
  requireCitations: boolean;

  /** Whether to allow unresolved conflicts (marked as ambiguous) */
  allowUnresolved: boolean;

  /** Threshold for considering values as conflicting (0-1, for semantic comparison) */
  conflictThreshold: number;

  /** Whether to generate a decision log explaining resolutions */
  generateDecisionLog: boolean;

  /** Auto-approval threshold - confidence required to auto-resolve (0-1) */
  autoResolveThreshold?: number;
}

export interface FieldConflict {
  field: string;
  values: Array<{
    value: unknown;
    sources: string[];
    artifact: Artifact;
  }>;
  resolution?: unknown;
  resolutionStrategy: ResolutionStrategy;
  confidence: number; // 0-1
  isResolved: boolean;
  requiresManualReview: boolean;
}

export interface ConflictReport {
  /** Source artifacts being reconciled */
  sources: Artifact[];

  /** Detected conflicts */
  conflicts: FieldConflict[];

  /** Overall resolution status */
  status: "resolved" | "partial" | "unresolved";

  /** Decision log entries */
  decisionLog: DecisionLogEntry[];

  /** Whether any conflicts require manual review */
  requiresManualReview: boolean;

  /** Confidence score for the overall resolution (0-1) */
  confidence: number;

  /** Proposed resolved artifact content */
  proposedContent?: string;
}

export interface DecisionLogEntry {
  conflict: string;
  decision: string;
  rationale: string;
  sourceIds: string[];
  confidence: number;
  resolutionStrategy: ResolutionStrategy;
}

export const DEFAULT_POLICY: ConflictResolutionPolicy = {
  strategy: "latest",
  requireCitations: true,
  allowUnresolved: true,
  conflictThreshold: 0.8,
  generateDecisionLog: true,
  autoResolveThreshold: 0.9,
};

/**
 * Detect conflicts between artifacts at the field level
 */
export function detectFieldConflicts(
  artifacts: Artifact[],
  fields: string[],
  policy: ConflictResolutionPolicy,
): FieldConflict[] {
  const conflicts: FieldConflict[] = [];

  for (const field of fields) {
    const values = new Map<string, string[]>();

    for (const artifact of artifacts) {
      const value =
        getNestedValue(artifact.data, field) ??
        getNestedValue(artifact as Record<string, unknown>, field);
      if (value !== undefined) {
        const key = JSON.stringify(value);
        const existing = values.get(key);
        if (existing) {
          existing.push(artifact.id);
        } else {
          values.set(key, [artifact.id]);
        }
      }
    }

    // If multiple distinct values, it's a conflict
    if (values.size > 1) {
      const valueList: FieldConflict["values"] = [];
      for (const [keyStr, sourceIds] of values) {
        const value = JSON.parse(keyStr);
        // Find an artifact that has this value
        const artifact = artifacts.find((a) => {
          const v =
            getNestedValue(a.data, field) ??
            getNestedValue(a as Record<string, unknown>, field);
          return JSON.stringify(v) === keyStr;
        });
        if (artifact) {
          valueList.push({ value, sources: sourceIds, artifact });
        }
      }

      conflicts.push({
        field,
        values: valueList,
        resolutionStrategy: policy.fieldPolicies?.[field] ?? policy.strategy,
        confidence: 0,
        isResolved: false,
        requiresManualReview: false,
      });
    }
  }

  return conflicts;
}

/**
 * Resolve a single field conflict using the specified strategy
 */
export function resolveFieldConflict(
  conflict: FieldConflict,
  policy: ConflictResolutionPolicy,
): FieldConflict {
  const strategy = conflict.resolutionStrategy;
  const sorted = [...conflict.values];
  let resolution: unknown;
  let confidence = 0.5;
  let requiresManualReview = false;

  if (sorted.length === 0) {
    return {
      ...conflict,
      resolution: undefined,
      confidence: 0,
      isResolved: false,
      requiresManualReview: true,
    };
  }

  const first = sorted[0];
  if (!first) {
    return {
      ...conflict,
      resolution: undefined,
      confidence: 0,
      isResolved: false,
      requiresManualReview: true,
    };
  }

  switch (strategy) {
    case "latest": {
      sorted.sort(
        (a, b) =>
          new Date(b.artifact.created_at).getTime() -
          new Date(a.artifact.created_at).getTime(),
      );
      const winner = sorted[0];
      resolution = winner ? winner.value : first.value;
      confidence = 0.8;
      break;
    }

    case "earliest": {
      sorted.sort(
        (a, b) =>
          new Date(a.artifact.created_at).getTime() -
          new Date(b.artifact.created_at).getTime(),
      );
      const winner = sorted[0];
      resolution = winner ? winner.value : first.value;
      confidence = 0.8;
      break;
    }

    case "longest": {
      sorted.sort(
        (a, b) =>
          JSON.stringify(b.value).length - JSON.stringify(a.value).length,
      );
      const winner = sorted[0];
      resolution = winner ? winner.value : first.value;
      confidence = 0.6;
      break;
    }

    case "shortest": {
      sorted.sort(
        (a, b) =>
          JSON.stringify(a.value).length - JSON.stringify(b.value).length,
      );
      const winner = sorted[0];
      resolution = winner ? winner.value : first.value;
      confidence = 0.6;
      break;
    }

    case "source-priority": {
      if (policy.sourcePriority) {
        sorted.sort((a, b) => {
          const aPriority =
            policy.sourcePriority?.indexOf(a.artifact.type) ??
            Number.POSITIVE_INFINITY;
          const bPriority =
            policy.sourcePriority?.indexOf(b.artifact.type) ??
            Number.POSITIVE_INFINITY;
          return aPriority - bPriority;
        });
        const winner = sorted[0];
        resolution = winner ? winner.value : first.value;
        confidence = 0.85;
      } else {
        resolution = first.value;
        confidence = 0.5;
      }
      break;
    }

    case "majority-vote": {
      sorted.sort((a, b) => b.sources.length - a.sources.length);
      const winner = sorted[0];
      resolution = winner ? winner.value : first.value;
      confidence = winner
        ? winner.sources.length /
          conflict.values.reduce((sum, v) => sum + v.sources.length, 0)
        : 0.5;
      break;
    }

    case "consensus": {
      const firstVal = conflict.values[0];
      if (
        conflict.values.length === 1 ||
        (firstVal &&
          conflict.values.every(
            (v) => JSON.stringify(v.value) === JSON.stringify(firstVal.value),
          ))
      ) {
        resolution = firstVal ? firstVal.value : first.value;
        confidence = 1.0;
      } else {
        requiresManualReview = true;
        confidence = 0.3;
      }
      break;
    }

    case "manual":
      requiresManualReview = true;
      confidence = 0;
      break;

    default:
      resolution = first.value;
      confidence = 0.5;
  }

  const autoResolveThreshold = policy.autoResolveThreshold ?? 0.9;
  if (confidence < autoResolveThreshold && !requiresManualReview) {
    requiresManualReview = true;
  }

  return {
    ...conflict,
    resolution,
    confidence,
    isResolved: !requiresManualReview,
    requiresManualReview,
  };
}

/**
 * Generate a decision log entry for a resolved conflict
 */
function generateDecisionLogEntry(
  conflict: FieldConflict,
  _policy: ConflictResolutionPolicy,
): DecisionLogEntry {
  const winningSource = conflict.values.find(
    (v) => JSON.stringify(v.value) === JSON.stringify(conflict.resolution),
  );

  return {
    conflict: conflict.field,
    decision: JSON.stringify(conflict.resolution),
    rationale: `Selected using ${conflict.resolutionStrategy} strategy${
      winningSource ? ` (from ${winningSource.artifact.id})` : ""
    }`,
    sourceIds: winningSource?.sources ?? [],
    confidence: conflict.confidence,
    resolutionStrategy: conflict.resolutionStrategy,
  };
}

/**
 * Reconcile multiple artifacts using the provided policy
 */
export function reconcileArtifacts(
  artifacts: Artifact[],
  fields: string[],
  policy: ConflictResolutionPolicy = DEFAULT_POLICY,
): ConflictReport {
  if (artifacts.length < 2) {
    return {
      sources: artifacts,
      conflicts: [],
      status: "resolved",
      decisionLog: [],
      requiresManualReview: false,
      confidence: 1,
      proposedContent: artifacts[0]?.content_md ?? undefined,
    };
  }

  const conflicts = detectFieldConflicts(artifacts, fields, policy);
  const resolvedConflicts = conflicts.map((c) =>
    resolveFieldConflict(c, policy),
  );
  const decisionLog: DecisionLogEntry[] = [];

  for (const conflict of resolvedConflicts) {
    if (conflict.isResolved || policy.generateDecisionLog) {
      decisionLog.push(generateDecisionLogEntry(conflict, policy));
    }
  }

  const unresolvedCount = resolvedConflicts.filter((c) => !c.isResolved).length;
  const requiresManualReview = resolvedConflicts.some(
    (c) => c.requiresManualReview,
  );

  // Calculate overall confidence
  const avgConfidence =
    resolvedConflicts.length > 0
      ? resolvedConflicts.reduce((sum, c) => sum + c.confidence, 0) /
        resolvedConflicts.length
      : 1;

  const status: ConflictReport["status"] =
    unresolvedCount === 0
      ? "resolved"
      : unresolvedCount < resolvedConflicts.length / 2
        ? "partial"
        : "unresolved";

  return {
    sources: artifacts,
    conflicts: resolvedConflicts,
    status,
    decisionLog,
    requiresManualReview,
    confidence: avgConfidence,
  };
}

/**
 * Format a conflict report as markdown for human review
 */
export function formatConflictReport(report: ConflictReport): string {
  const lines: string[] = [];

  lines.push("# Conflict Resolution Report\n");
  lines.push(`**Status:** ${report.status}`);
  lines.push(`**Confidence:** ${Math.round(report.confidence * 100)}%`);
  lines.push(
    `**Requires Manual Review:** ${report.requiresManualReview ? "Yes" : "No"}\n`,
  );

  if (report.conflicts.length > 0) {
    lines.push("## Conflicts Detected\n");
    for (const conflict of report.conflicts) {
      lines.push(`### ${conflict.field}`);
      lines.push(`**Strategy:** ${conflict.resolutionStrategy}`);
      lines.push(`**Resolved:** ${conflict.isResolved ? "Yes" : "No"}`);
      lines.push(`**Confidence:** ${Math.round(conflict.confidence * 100)}%\n`);

      lines.push("**Values:**");
      for (const value of conflict.values) {
        const marker =
          JSON.stringify(value.value) === JSON.stringify(conflict.resolution)
            ? "✓"
            : "○";
        lines.push(
          `${marker} \`${JSON.stringify(value.value)}\` from ${value.sources.join(", ")}`,
        );
      }

      if (conflict.resolution !== undefined) {
        lines.push(
          `\n**Resolution:** \`${JSON.stringify(conflict.resolution)}\``,
        );
      }
      lines.push("");
    }
  }

  if (report.decisionLog.length > 0) {
    lines.push("## Decision Log\n");
    lines.push("| Conflict | Decision | Rationale | Confidence |");
    lines.push("|----------|----------|-----------|------------|");
    for (const entry of report.decisionLog) {
      lines.push(
        `| ${entry.conflict} | ${entry.decision.slice(0, 30)}${entry.decision.length > 30 ? "..." : ""} | ${entry.rationale.slice(0, 40)}${entry.rationale.length > 40 ? "..." : ""} | ${Math.round(entry.confidence * 100)}% |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Helper to get nested object values
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Create a policy from input parameters (for workflow usage)
 */
export function createPolicyFromInput(input: {
  strategy?: ResolutionStrategy;
  sourcePriority?: string[];
  requireCitations?: boolean;
  allowUnresolved?: boolean;
  conflictThreshold?: number;
  autoResolveThreshold?: number;
}): ConflictResolutionPolicy {
  return {
    strategy: input.strategy ?? DEFAULT_POLICY.strategy,
    sourcePriority: input.sourcePriority,
    requireCitations: input.requireCitations ?? DEFAULT_POLICY.requireCitations,
    allowUnresolved: input.allowUnresolved ?? DEFAULT_POLICY.allowUnresolved,
    conflictThreshold:
      input.conflictThreshold ?? DEFAULT_POLICY.conflictThreshold,
    generateDecisionLog: DEFAULT_POLICY.generateDecisionLog,
    autoResolveThreshold:
      input.autoResolveThreshold ?? DEFAULT_POLICY.autoResolveThreshold,
  };
}
