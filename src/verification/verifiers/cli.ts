/**
 * CLI Verifier
 *
 * Executes shell commands for verification.
 */

import type { Artifact } from "../../core/types";
import type { VerificationMethod, VerificationResult } from "../../isc/types";
import type { Verifier } from "../types";

export class CLIVerifier implements Verifier {
  async verify(
    method: Extract<VerificationMethod, { type: "CLI" }>,
    artifact: Artifact,
    _context?: Record<string, unknown>,
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    try {
      // Run command with artifact content as stdin
      const proc = Bun.spawn(["sh", "-c", method.command], {
        stdin: artifact.content_md
          ? new TextEncoder().encode(artifact.content_md)
          : undefined,
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      return {
        criterionId: "",
        passed: exitCode === 0,
        evidence: stdout.trim() || stderr.trim() || `Exit code: ${exitCode}`,
        actualValue: stdout.trim(),
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        criterionId: "",
        passed: false,
        evidence: `Error: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }
}
