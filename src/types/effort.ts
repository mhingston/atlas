/**
 * Effort Level System Types
 *
 * Defines tiered effort levels that control ISC depth, verification thoroughness,
 * and resource allocation.
 */

export type EffortLevel =
  | "INSTANT" // <10s
  | "FAST" // <1min
  | "STANDARD" // <2min (default)
  | "EXTENDED" // <8min
  | "ADVANCED" // <16min
  | "DEEP" // <32min
  | "COMPREHENSIVE"; // <120min

export interface EffortConfig {
  level: EffortLevel;
  budgetSeconds: number;
  iscMinCriteria: number;
  iscMaxCriteria: number;
  enablePlanMode: boolean;
  enableVerificationRehearsal: boolean;
  constraintExtraction: boolean;
  parallelVerifiers: number;
}

export const EFFORT_CONFIGS: Record<EffortLevel, EffortConfig> = {
  INSTANT: {
    level: "INSTANT",
    budgetSeconds: 10,
    iscMinCriteria: 0,
    iscMaxCriteria: 4,
    enablePlanMode: false,
    enableVerificationRehearsal: false,
    constraintExtraction: false,
    parallelVerifiers: 1,
  },
  FAST: {
    level: "FAST",
    budgetSeconds: 60,
    iscMinCriteria: 4,
    iscMaxCriteria: 8,
    enablePlanMode: false,
    enableVerificationRehearsal: false,
    constraintExtraction: false,
    parallelVerifiers: 2,
  },
  STANDARD: {
    level: "STANDARD",
    budgetSeconds: 120,
    iscMinCriteria: 4,
    iscMaxCriteria: 16,
    enablePlanMode: false,
    enableVerificationRehearsal: false,
    constraintExtraction: true,
    parallelVerifiers: 4,
  },
  EXTENDED: {
    level: "EXTENDED",
    budgetSeconds: 480,
    iscMinCriteria: 12,
    iscMaxCriteria: 40,
    enablePlanMode: true,
    enableVerificationRehearsal: true,
    constraintExtraction: true,
    parallelVerifiers: 8,
  },
  ADVANCED: {
    level: "ADVANCED",
    budgetSeconds: 960,
    iscMinCriteria: 20,
    iscMaxCriteria: 80,
    enablePlanMode: true,
    enableVerificationRehearsal: true,
    constraintExtraction: true,
    parallelVerifiers: 12,
  },
  DEEP: {
    level: "DEEP",
    budgetSeconds: 1920,
    iscMinCriteria: 40,
    iscMaxCriteria: 160,
    enablePlanMode: true,
    enableVerificationRehearsal: true,
    constraintExtraction: true,
    parallelVerifiers: 16,
  },
  COMPREHENSIVE: {
    level: "COMPREHENSIVE",
    budgetSeconds: 7200,
    iscMinCriteria: 80,
    iscMaxCriteria: 320,
    enablePlanMode: true,
    enableVerificationRehearsal: true,
    constraintExtraction: true,
    parallelVerifiers: 32,
  },
};

/**
 * Map routing profile to effort level
 */
export function profileToEffortLevel(profile: string): EffortLevel {
  const mapping: Record<string, EffortLevel> = {
    instant: "INSTANT",
    fast: "FAST",
    balanced: "STANDARD",
    quality: "EXTENDED",
    deep: "DEEP",
  };
  return mapping[profile] || "STANDARD";
}

/**
 * Get effort config for a level
 */
export function getEffortConfig(level: EffortLevel): EffortConfig {
  return EFFORT_CONFIGS[level];
}
