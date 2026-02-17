/**
 * Budget Tracker
 *
 * Monitors execution time against effort level budgets.
 */

import type { EffortConfig, EffortLevel } from "../types/effort";
import { EFFORT_CONFIGS } from "../types/effort";
import { logInfo } from "./logger";

export class BudgetTracker {
  private startTime: number;
  private config: EffortConfig;

  constructor(
    private jobId: string,
    effortLevel: EffortLevel,
  ) {
    this.config = EFFORT_CONFIGS[effortLevel];
    this.startTime = Date.now();
  }

  /**
   * Get remaining budget in milliseconds
   */
  getRemainingBudget(): number {
    const elapsed = Date.now() - this.startTime;
    return Math.max(0, this.config.budgetSeconds * 1000 - elapsed);
  }

  /**
   * Get elapsed time as percentage of budget
   */
  getElapsedPercent(): number {
    const elapsed = Date.now() - this.startTime;
    return (elapsed / (this.config.budgetSeconds * 1000)) * 100;
  }

  /**
   * Check if execution is over budget
   */
  isOverBudget(): boolean {
    return this.getElapsedPercent() > 100;
  }

  /**
   * Check if should auto-compress (150% over phase budget)
   */
  shouldAutoCompress(): boolean {
    return this.getElapsedPercent() > 150;
  }

  /**
   * Get elapsed time in milliseconds
   */
  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get budget status summary
   */
  getStatus(): {
    elapsedMs: number;
    remainingMs: number;
    percent: number;
    overBudget: boolean;
    shouldCompress: boolean;
  } {
    return {
      elapsedMs: this.getElapsedMs(),
      remainingMs: this.getRemainingBudget(),
      percent: this.getElapsedPercent(),
      overBudget: this.isOverBudget(),
      shouldCompress: this.shouldAutoCompress(),
    };
  }

  /**
   * Log budget status for reflection
   */
  logStatus(): void {
    const status = this.getStatus();
    logInfo("budget.status", {
      job_id: this.jobId,
      elapsed_ms: status.elapsedMs,
      remaining_ms: status.remainingMs,
      percent: status.percent.toFixed(1),
      over_budget: status.overBudget,
    });
  }
}
