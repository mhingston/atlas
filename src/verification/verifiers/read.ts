/**
 * Read Verifier
 *
 * Checks file contents for verification.
 */

import { existsSync, readFileSync } from "node:fs";
import type { Artifact } from "../../core/types";
import type { VerificationMethod, VerificationResult } from "../../isc/types";
import type { Verifier } from "../types";

export class ReadVerifier implements Verifier {
  async verify(
    method: Extract<VerificationMethod, { type: "READ" }>,
    artifact: Artifact,
    _context?: Record<string, unknown>,
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    try {
      const path = method.path;

      if (!existsSync(path)) {
        return {
          criterionId: "",
          passed: false,
          evidence: `File not found: ${path}`,
          durationMs: Date.now() - startTime,
        };
      }

      const content = readFileSync(path, "utf-8");

      // For artifacts with content, verify the file contains expected content
      if (artifact.content_md) {
        const contains = content.includes(
          artifact.content_md.substring(0, 100),
        );
        return {
          criterionId: "",
          passed: contains,
          evidence: contains
            ? "File contains expected content"
            : "File does not contain expected content",
          actualValue: `File size: ${content.length} bytes`,
          durationMs: Date.now() - startTime,
        };
      }

      return {
        criterionId: "",
        passed: true,
        evidence: `File exists: ${path}`,
        actualValue: `File size: ${content.length} bytes`,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        criterionId: "",
        passed: false,
        evidence: `Error reading file: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }
}
