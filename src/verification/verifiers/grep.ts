/**
 * Grep Verifier
 *
 * Performs pattern matching against artifact content.
 */

import type { Artifact } from "../../core/types";
import type { VerificationMethod, VerificationResult } from "../../isc/types";
import type { Verifier } from "../types";

export class GrepVerifier implements Verifier {
  async verify(
    method: Extract<VerificationMethod, { type: "GREP" }>,
    artifact: Artifact,
    _context?: Record<string, unknown>,
  ): Promise<VerificationResult> {
    const startTime = Date.now();
    const content = artifact.content_md || "";

    try {
      const pattern = new RegExp(method.pattern);
      const matches = content.match(pattern);

      return {
        criterionId: "",
        passed: matches !== null && matches.length > 0,
        evidence: matches
          ? `Found ${matches.length} matches`
          : "No matches found",
        actualValue: matches?.join(", ") || "none",
        thresholdValue: method.pattern,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        criterionId: "",
        passed: false,
        evidence: `Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }
}
