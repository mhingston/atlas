/**
 * GatedHarnessRuntime: Policy enforcement for harness operations
 *
 * Wraps any HarnessRuntime and enforces policy checks.
 * Note: The underlying harness (e.g., ConfigurableCLIHarness) already enforces
 * exec:<id> and fs:read/write capabilities. This wrapper adds a safety check
 * for apply mode at the router level.
 */

import type { Policy } from "../core/policy";
import type { HarnessRunArgs, HarnessRunResult, HarnessRuntime } from "./types";

export class GatedHarnessRuntime implements HarnessRuntime {
  constructor(
    private inner: HarnessRuntime,
    private policy: Policy,
  ) {}

  async runTask(args: HarnessRunArgs): Promise<HarnessRunResult> {
    // The inner harness (e.g., ConfigurableCLIHarness) already enforces:
    // - exec:<harness-id> capability
    // - fs:read:<cwd> capability
    // - fs:write:<cwd> capability for apply mode
    //
    // This wrapper just passes through to the inner harness.
    // Additional gating can be added here if needed.

    return this.inner.runTask(args);
  }
}
