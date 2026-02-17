/**
 * Verification Engine
 *
 * Orchestrates artifact verification against ISC criteria.
 */

import type { Database } from "bun:sqlite";
import { ulid } from "ulid";
import type { LLMRuntime } from "../ai/llm_runtime";
import type { ReadOnlyRepo } from "../core/repo";
import type { Artifact } from "../core/types";
import type {
  AntiCriterion,
  ISCDefinition,
  ISCReport,
  IdealStateCriterion,
  VerificationMethod,
  VerificationResult,
} from "../isc/types";
import type { Verifier } from "./types";
import { CLIVerifier } from "./verifiers/cli";
import { CustomVerifier } from "./verifiers/custom";
import { GrepVerifier } from "./verifiers/grep";
import { ReadVerifier } from "./verifiers/read";

export class VerificationEngine {
  private verifiers: Map<string, Verifier> = new Map();

  constructor(
    private llmRouter: LLMRuntime,
    private repo: ReadOnlyRepo,
    private db: Database,
  ) {
    // Register built-in verifiers
    this.registerVerifier("CLI", new CLIVerifier());
    this.registerVerifier("GREP", new GrepVerifier());
    this.registerVerifier("READ", new ReadVerifier());
    this.registerVerifier("CUSTOM", new CustomVerifier(llmRouter, repo));
  }

  registerVerifier(type: string, verifier: Verifier): void {
    this.verifiers.set(type, verifier);
  }

  async verify(
    method: VerificationMethod,
    artifact: Artifact,
    criterionId: string,
    context?: Record<string, unknown>,
  ): Promise<VerificationResult> {
    const verifier = this.verifiers.get(method.type);
    if (!verifier) {
      throw new Error(`Unknown verification method: ${method.type}`);
    }

    const result = await verifier.verify(method, artifact, context);
    result.criterionId = criterionId;
    return result;
  }

  async verifyCriterion(
    criterion: IdealStateCriterion | AntiCriterion,
    artifact: Artifact,
    context?: Record<string, unknown>,
  ): Promise<VerificationResult> {
    return this.verify(criterion.verify, artifact, criterion.id, context);
  }

  async verifyAllCriteria(
    definition: ISCDefinition,
    artifact: Artifact,
    jobId?: string,
    workflowId?: string,
    additionalContext?: Record<string, unknown>,
  ): Promise<ISCReport> {
    const startTime = Date.now();
    const ctx = { ...additionalContext, artifact, jobId, workflowId };

    // Verify all criteria in parallel
    const [criteriaResults, antiCriteriaResults] = await Promise.all([
      Promise.all(
        definition.idealCriteria.map((c) =>
          this.verifyCriterion(c, artifact, ctx),
        ),
      ),
      Promise.all(
        definition.antiCriteria.map((c) =>
          this.verifyCriterion(c, artifact, ctx),
        ),
      ),
    ]);

    // Check for CRITICAL failures
    const criticalFailures = criteriaResults.filter((r) => {
      if (!r.passed) {
        const criterion = definition.idealCriteria.find(
          (c) => c.id === r.criterionId,
        );
        return criterion?.priority === "CRITICAL";
      }
      return false;
    });

    const passed = criticalFailures.length === 0;
    const _durationMs = Date.now() - startTime;

    const report: ISCReport = {
      id: `iscr_${ulid()}`,
      artifactId: artifact.id,
      artifactType: artifact.type,
      passed,
      criteriaResults,
      antiCriteriaResults,
      summary: this.generateSummary(
        criteriaResults,
        antiCriteriaResults,
        passed,
      ),
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    // Store report in database
    this.storeReport(report);

    return report;
  }

  private generateSummary(
    criteriaResults: VerificationResult[],
    antiCriteriaResults: VerificationResult[],
    passed: boolean,
  ): string {
    const totalCriteria = criteriaResults.length;
    const passedCriteria = criteriaResults.filter((r) => r.passed).length;
    const totalAnti = antiCriteriaResults.length;
    const passedAnti = antiCriteriaResults.filter((r) => r.passed).length;

    return passed
      ? `All criteria passed: ${passedCriteria}/${totalCriteria} ideal criteria, ${passedAnti}/${totalAnti} anti-criteria`
      : `Verification failed: ${
          totalCriteria - passedCriteria
        } ideal criteria failed, ${totalAnti - passedAnti} anti-criteria failed`;
  }

  private storeReport(report: ISCReport): void {
    try {
      this.db
        .prepare(
          `
        INSERT INTO isc_reports (
          id, artifact_id, artifact_type, passed,
          criteria_results, anti_criteria_results, summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          report.id,
          report.artifactId,
          report.artifactType,
          report.passed ? 1 : 0,
          JSON.stringify(report.criteriaResults),
          JSON.stringify(report.antiCriteriaResults),
          report.summary,
          report.createdAt,
        );
    } catch (error) {
      console.error("Failed to store ISC report:", error);
    }
  }
}
