/**
 * Reflection Capture
 *
 * Captures Q1/Q2/Q3 reflections after workflow execution using LLM.
 */

import { ulid } from "ulid";
import type { LLMRuntime } from "../ai/llm_runtime";
import type { ISCReport } from "../isc/types";
import type { EffortLevel } from "../types/effort";
import { EFFORT_CONFIGS } from "../types/effort";
import type { AlgorithmReflection, ReflectionQuery } from "../types/reflection";
import type { CommandQueue } from "./queue";
import type { ReadOnlyRepo } from "./repo";

interface ReflectionContext {
  jobId: string;
  workflowId: string;
  effortLevel: EffortLevel;
  artifactType: string;
  criteriaCount: number;
  criteriaPassed: number;
  criteriaFailed: number;
  withinBudget: boolean;
  elapsedPercent: number;
  iscReportId?: string;
}

export class ReflectionCapture {
  constructor(
    private commandQueue: CommandQueue,
    private repo: ReadOnlyRepo,
    private llmRouter: LLMRuntime,
  ) {}

  async capture(
    jobId: string,
    effortLevel: EffortLevel,
    iscReport?: ISCReport,
  ): Promise<AlgorithmReflection> {
    const job = this.repo.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Build reflection context
    const elapsedPercent = this.calculateElapsedPercent(jobId, effortLevel);
    const ctx: ReflectionContext = {
      jobId,
      workflowId: job.workflow_id,
      effortLevel,
      artifactType: (job.input?.artifactType as string) || "unknown",
      criteriaCount: iscReport?.criteriaResults.length || 0,
      criteriaPassed:
        iscReport?.criteriaResults.filter((r) => r.passed).length || 0,
      criteriaFailed:
        iscReport?.criteriaResults.filter((r) => !r.passed).length || 0,
      withinBudget: elapsedPercent <= 100,
      elapsedPercent,
      iscReportId: iscReport?.id,
    };

    // Generate reflection using LLM
    const reflection = await this.generateReflection(ctx);

    // Store reflection via command queue
    this.commandQueue.enqueue({
      type: "reflection.create",
      reflection,
    });

    return reflection;
  }

  private calculateElapsedPercent(
    jobId: string,
    effortLevel: EffortLevel,
  ): number {
    const job = this.repo.getJob(jobId);
    if (!job || !job.started_at) {
      return 0;
    }

    const startTime = new Date(job.started_at).getTime();
    const endTime = job.finished_at
      ? new Date(job.finished_at).getTime()
      : Date.now();
    const elapsedMs = endTime - startTime;
    const budgetMs = EFFORT_CONFIGS[effortLevel].budgetSeconds * 1000;

    return (elapsedMs / budgetMs) * 100;
  }

  private async generateReflection(
    ctx: ReflectionContext,
  ): Promise<AlgorithmReflection> {
    const prompt = `
You are reflecting on a workflow execution. Provide thoughtful answers to these three questions:

Workflow: ${ctx.workflowId}
Artifact Type: ${ctx.artifactType}
Effort Level: ${ctx.effortLevel}
Criteria Passed: ${ctx.criteriaPassed}/${ctx.criteriaCount}
Within Budget: ${ctx.withinBudget}
Budget Used: ${ctx.elapsedPercent.toFixed(1)}%

Q1 - Self Reflection: What would I do differently if I were doing this task again?
Q2 - Workflow Reflection: What would a smarter workflow do differently?
Q3 - System Reflection: What would a smarter Atlas system do to make this better?

Respond in JSON format:
{
  "q1Self": "your answer to Q1",
  "q2Workflow": "your answer to Q2",
  "q3System": "your answer to Q3"
}
`;

    try {
      const result = await this.llmRouter.generateText({
        prompt,
        temperature: 0.7,
      });

      let parsed: { q1Self: string; q2Workflow: string; q3System: string };
      try {
        parsed = JSON.parse(result.text);
      } catch {
        // Fallback: parse manually
        const lines = result.text.split("\n");
        parsed = {
          q1Self: lines.find((l) => l.toLowerCase().includes("q1")) || "N/A",
          q2Workflow:
            lines.find((l) => l.toLowerCase().includes("q2")) || "N/A",
          q3System: lines.find((l) => l.toLowerCase().includes("q3")) || "N/A",
        };
      }

      return {
        id: `ref_${ulid()}`,
        jobId: ctx.jobId,
        workflowId: ctx.workflowId,
        timestamp: new Date().toISOString(),
        effortLevel: ctx.effortLevel,
        artifactType: ctx.artifactType,
        criteriaCount: ctx.criteriaCount,
        criteriaPassed: ctx.criteriaPassed,
        criteriaFailed: ctx.criteriaFailed,
        withinBudget: ctx.withinBudget,
        elapsedPercent: ctx.elapsedPercent,
        q1Self: parsed.q1Self,
        q2Workflow: parsed.q2Workflow,
        q3System: parsed.q3System,
        iscReportId: ctx.iscReportId,
        version: process.env.ATLAS_VERSION || "1.0.0",
      };
    } catch (error) {
      // Fallback reflection on error
      return {
        id: `ref_${ulid()}`,
        jobId: ctx.jobId,
        workflowId: ctx.workflowId,
        timestamp: new Date().toISOString(),
        effortLevel: ctx.effortLevel,
        artifactType: ctx.artifactType,
        criteriaCount: ctx.criteriaCount,
        criteriaPassed: ctx.criteriaPassed,
        criteriaFailed: ctx.criteriaFailed,
        withinBudget: ctx.withinBudget,
        elapsedPercent: ctx.elapsedPercent,
        q1Self: "Error generating reflection",
        q2Workflow: "Error generating reflection",
        q3System: `Error: ${error instanceof Error ? error.message : String(error)}`,
        iscReportId: ctx.iscReportId,
        version: process.env.ATLAS_VERSION || "1.0.0",
      };
    }
  }

  /**
   * Query reflections from the database
   */
  async queryReflections(
    _query: ReflectionQuery,
  ): Promise<AlgorithmReflection[]> {
    // This would query the database - for now return empty array
    // Implementation would be in the repo
    return [];
  }
}
