import { describe, expect, it } from "bun:test";
import { BudgetTracker } from "../../src/core/budget-tracker";
import type { EffortLevel } from "../../src/types/effort";

describe("BudgetTracker", () => {
  it("should track elapsed time", () => {
    const tracker = new BudgetTracker("job_123", "STANDARD");

    // Wait a tiny bit
    const start = Date.now();
    while (Date.now() - start < 10) {} // Small delay

    const elapsed = tracker.getElapsedMs();
    expect(elapsed).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
  });

  it("should calculate remaining budget", () => {
    const tracker = new BudgetTracker("job_123", "FAST"); // 60 seconds

    const remaining = tracker.getRemainingBudget();
    expect(remaining).toBeGreaterThan(59000); // Should be close to 60s
    expect(remaining).toBeLessThanOrEqual(60000);
  });

  it("should calculate elapsed percentage", () => {
    const tracker = new BudgetTracker("job_123", "INSTANT"); // 10 seconds

    // Wait a bit
    const start = Date.now();
    while (Date.now() - start < 50) {}

    const percent = tracker.getElapsedPercent();
    expect(percent).toBeGreaterThan(0);
    expect(percent).toBeLessThan(10); // Should be small for 10s budget
  });

  it("should detect when over budget", () => {
    // Create tracker with tiny budget
    const tracker = new BudgetTracker("job_123", "INSTANT");

    // Should not be over budget immediately
    expect(tracker.isOverBudget()).toBe(false);
  });

  it("should suggest auto-compression at 150%", () => {
    const tracker = new BudgetTracker("job_123", "INSTANT");

    // Should not suggest compression immediately
    expect(tracker.shouldAutoCompress()).toBe(false);
  });

  it("should return status object", () => {
    const tracker = new BudgetTracker("job_123", "STANDARD");
    const status = tracker.getStatus();

    expect(status).toHaveProperty("elapsedMs");
    expect(status).toHaveProperty("remainingMs");
    expect(status).toHaveProperty("percent");
    expect(status).toHaveProperty("overBudget");
    expect(status).toHaveProperty("shouldCompress");

    expect(typeof status.elapsedMs).toBe("number");
    expect(typeof status.remainingMs).toBe("number");
    expect(typeof status.percent).toBe("number");
    expect(typeof status.overBudget).toBe("boolean");
    expect(typeof status.shouldCompress).toBe("boolean");
  });

  it("should handle different effort levels", () => {
    const levels: EffortLevel[] = ["INSTANT", "FAST", "STANDARD", "EXTENDED"];

    for (const level of levels) {
      const tracker = new BudgetTracker(`job_${level}`, level);
      const status = tracker.getStatus();
      expect(status.remainingMs).toBeGreaterThan(0);
    }
  });
});
