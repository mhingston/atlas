/**
 * PRD (Persistent Requirements Document) System Types
 *
 * Defines the schema for storing intent and criteria alongside artifacts.
 */

import type { AntiCriterion, IdealStateCriterion } from "../isc/types";
import type { EffortLevel } from "./effort";

export type PRDStatus =
  | "DRAFT"
  | "CRITERIA_DEFINED"
  | "PLANNED"
  | "IN_PROGRESS"
  | "VERIFYING"
  | "COMPLETE"
  | "FAILED"
  | "BLOCKED";

export interface PRDDecision {
  date: string;
  decision: string;
  rationale: string;
  alternatives: string[];
}

export interface PRDLogEntry {
  iteration: number;
  date: string;
  phase: string;
  criteriaProgress: string;
  workDone: string;
  failing: string[];
  context: string;
}

export interface PRD {
  id: string;
  artifactId: string;
  workflowId: string;
  jobId: string;

  // Status
  status: PRDStatus;
  effortLevel: EffortLevel;

  // Content
  title: string;
  problemSpace: string;
  keyFiles: string[];
  constraints: string[];
  decisions: PRDDecision[];

  // ISC
  idealCriteria: IdealStateCriterion[];
  antiCriteria: AntiCriterion[];

  // Progress
  iteration: number;
  maxIterations: number;
  lastPhase: string;
  failingCriteria: string[];

  // Timestamps
  createdAt: string;
  updatedAt: string;

  // Log
  log: PRDLogEntry[];
}

export interface PRDFrontmatter {
  prd: boolean;
  id: string;
  artifact_id: string;
  workflow_id: string;
  job_id: string;
  status: PRDStatus;
  effort_level: EffortLevel;
  created: string;
  updated: string;
  iteration: number;
  max_iterations: number;
}

export interface PRDQuery {
  artifactId?: string;
  workflowId?: string;
  status?: PRDStatus;
  limit?: number;
}
