/**
 * ISC (Ideal State Criteria) System Types
 *
 * Defines the schema for explicit quality criteria that artifacts must meet.
 */

export type ISCPriority = "CRITICAL" | "IMPORTANT" | "NICE";
export type ISCConfidence = "EXPLICIT" | "INFERRED" | "REVERSE_ENGINEERED";
export type ISCDomain =
  | "accuracy"
  | "completeness"
  | "format"
  | "style"
  | "performance"
  | "security"
  | "general";
export type ISCScaleTier = "SIMPLE" | "MEDIUM" | "LARGE" | "MASSIVE";

export interface IdealStateCriterion {
  id: string;
  criterion: string;
  priority: ISCPriority;
  confidence: ISCConfidence;
  verify: VerificationMethod;
  domain?: ISCDomain;
}

export interface AntiCriterion {
  id: string;
  criterion: string;
  priority: ISCPriority;
  verify: VerificationMethod;
}

export type VerificationMethod =
  | { type: "CLI"; command: string }
  | { type: "TEST"; testId: string }
  | { type: "STATIC"; check: string }
  | { type: "BROWSER"; scenario: string }
  | { type: "GREP"; pattern: string }
  | { type: "READ"; path: string }
  | { type: "CUSTOM"; description: string; scriptPath?: string };

export interface ISCDefinition {
  artifactType: string;
  version: string;
  idealCriteria: IdealStateCriterion[];
  antiCriteria: AntiCriterion[];
  minCriteria: number;
  scaleTier: ISCScaleTier;
}

export interface VerificationResult {
  criterionId: string;
  passed: boolean;
  evidence: string;
  actualValue?: string;
  thresholdValue?: string;
  durationMs: number;
}

export interface ISCReport {
  id: string;
  artifactId: string;
  artifactType: string;
  passed: boolean;
  criteriaResults: VerificationResult[];
  antiCriteriaResults: VerificationResult[];
  summary: string;
  timestamp: string;
  createdAt: string;
}

export interface ISCReportRow {
  id: string;
  artifact_id: string;
  artifact_type: string;
  passed: number;
  criteria_results: string;
  anti_criteria_results: string;
  summary: string;
  created_at: string;
}
