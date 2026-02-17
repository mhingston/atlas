/**
 * Reflection System Types
 *
 * Defines the schema for systematic Q1/Q2/Q3 reflection after workflow execution.
 */

import type { EffortLevel } from "./effort";

export interface AlgorithmReflection {
  id: string;
  jobId: string;
  workflowId: string;
  timestamp: string;

  // Context
  effortLevel: EffortLevel;
  artifactType: string;
  criteriaCount: number;
  criteriaPassed: number;
  criteriaFailed: number;
  withinBudget: boolean;
  elapsedPercent: number;

  // Sentiment (optional user feedback)
  impliedSentiment?: number;
  userFeedback?: string;

  // Three-question reflection
  q1Self: string;
  q2Workflow: string;
  q3System: string;

  // Metadata
  iscReportId?: string;
  version: string;
}

export interface ReflectionRow {
  id: string;
  job_id: string;
  workflow_id: string;
  timestamp: string;
  effort_level: string;
  artifact_type: string;
  criteria_count: number;
  criteria_passed: number;
  criteria_failed: number;
  within_budget: number;
  elapsed_percent: number;
  implied_sentiment?: number;
  q1_self: string;
  q2_workflow: string;
  q3_system: string;
  version: string;
  isc_report_id?: string;
  metadata?: string;
}

export interface ReflectionQuery {
  workflowId?: string;
  artifactType?: string;
  since?: string;
  minSentiment?: number;
  limit?: number;
}
