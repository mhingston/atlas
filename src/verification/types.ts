/**
 * Verification System Types
 */

import type { Artifact } from "../core/types";
import type { VerificationMethod, VerificationResult } from "../isc/types";

export interface Verifier {
  verify(
    method: VerificationMethod,
    artifact: Artifact,
    context?: Record<string, unknown>,
  ): Promise<VerificationResult>;
}

export interface VerifierContext {
  artifact: Artifact;
  jobId?: string;
  workflowId?: string;
  [key: string]: unknown;
}
