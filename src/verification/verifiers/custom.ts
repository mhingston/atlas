/**
 * Custom Verifier
 *
 * Uses LLM for subjective/custom criteria evaluation.
 * Also supports external script execution.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { LLMRuntime } from "../../ai/llm_runtime";
import type { ReadOnlyRepo } from "../../core/repo";
import type { Artifact } from "../../core/types";
import type { VerificationMethod, VerificationResult } from "../../isc/types";
import type { Verifier } from "../types";

interface CustomVerificationResponse {
  passed: boolean;
  evidence: string;
  actualValue?: string;
  confidence?: number;
}

export class CustomVerifier implements Verifier {
  constructor(
    private llmRouter: LLMRuntime,
    private repo: ReadOnlyRepo,
  ) {}

  async verify(
    method: Extract<VerificationMethod, { type: "CUSTOM" }>,
    artifact: Artifact,
    context?: Record<string, unknown>,
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    // If scriptPath is provided, try to execute external script first
    if (method.scriptPath) {
      return this.runExternalScript(method.scriptPath, artifact, context);
    }

    // Otherwise, use LLM-based evaluation
    return this.runLLMEvaluation(
      method.description,
      artifact,
      context,
      startTime,
    );
  }

  private async runExternalScript(
    scriptPath: string,
    artifact: Artifact,
    context?: Record<string, unknown>,
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    try {
      // Resolve script path relative to ATLAS_DB_PATH or absolute
      const resolvedPath = scriptPath.startsWith("/")
        ? scriptPath
        : join(process.env.ATLAS_DB_PATH || ".", "..", "scripts", scriptPath);

      if (!existsSync(resolvedPath)) {
        return {
          criterionId: "",
          passed: false,
          evidence: `External script not found: ${resolvedPath}`,
          durationMs: Date.now() - startTime,
        };
      }

      // Import and execute the script
      const scriptModule = await import(resolvedPath);
      const result = await scriptModule.verify(artifact, context, this.repo);

      return {
        criterionId: "",
        passed: result.passed ?? false,
        evidence: result.evidence || "External script verification",
        actualValue: result.actualValue,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        criterionId: "",
        passed: false,
        evidence: `External script error: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async runLLMEvaluation(
    description: string,
    artifact: Artifact,
    context: Record<string, unknown> | undefined,
    startTime: number,
  ): Promise<VerificationResult> {
    try {
      const prompt = `
Evaluate this criterion for the artifact below:
Criterion: ${description}

Artifact Content:
${artifact.content_md || "(no content)"}

Context:
${JSON.stringify(context, null, 2)}

Respond in JSON format:
{
  "passed": boolean,
  "evidence": "explanation of evaluation",
  "actualValue": "what was measured",
  "confidence": number (0-1)
}
`;

      const result = await this.llmRouter.generateText({
        prompt,
        temperature: 0.1,
      });

      let evaluation: CustomVerificationResponse;
      try {
        evaluation = JSON.parse(result.text) as CustomVerificationResponse;
      } catch {
        // Fallback: treat non-JSON response as passed if it contains "pass" or "true"
        const text = result.text.toLowerCase();
        evaluation = {
          passed: text.includes("pass") || text.includes("true"),
          evidence: result.text,
          actualValue: undefined,
          confidence: 0.5,
        };
      }

      return {
        criterionId: "",
        passed: evaluation.passed,
        evidence: evaluation.evidence,
        actualValue: evaluation.actualValue,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        criterionId: "",
        passed: false,
        evidence: `LLM evaluation error: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }
}
