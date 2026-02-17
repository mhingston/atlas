import { ulid } from "ulid";
import type { SkillAwareLLMRuntime } from "../ai/skill_aware_llm_runtime";
import { TracedEmbeddingRuntime } from "../ai/traced_embedding_runtime";
import { TracedLLMRuntime } from "../ai/traced_llm_runtime";
import { BudgetTracker } from "../core/budget-tracker";
import type { Command } from "../core/commands";
import { db } from "../core/db";
import { logError, logInfo } from "../core/logger";
import { PRDStorage } from "../core/prd-storage";
import { CommandQueue } from "../core/queue";
import { ReflectionCapture } from "../core/reflection-capture";
import type { ReadOnlyRepo } from "../core/repo";
import { createTraceEmitter } from "../core/trace";
import type { Artifact, JobStatus } from "../core/types";
import { TracedHarnessRuntime } from "../harness/traced_harness_runtime";
import { registerDefaultISCDefinitions } from "../isc/definitions";
import { globalISCRegistry } from "../isc/registry";
import type { ISCDefinition, ISCReport } from "../isc/types";
import type { PluginRegistry } from "../plugins/registry";
import { profileToEffortLevel } from "../types/effort";
import type { EffortLevel } from "../types/effort";
import type { PRD } from "../types/prd";
import { VerificationEngine } from "../verification/engine";

// Initialize ISC registry with default definitions
registerDefaultISCDefinitions();

/**
 * Local command buffer for job execution
 * Wraps CommandQueue to capture commands and inspect status intent
 */
class LocalCommandBuffer extends CommandQueue {
  private captured: Command[] = [];

  override enqueue(cmd: Command) {
    this.captured.push(cmd);
  }

  override drain(max?: number): Command[] {
    const cmds = [...this.captured];
    this.captured = [];
    return max ? cmds.slice(0, max) : cmds;
  }

  override size(): number {
    return this.captured.length;
  }

  getCaptured(): Command[] {
    return [...this.captured];
  }

  hasArtifactType(type: string, jobId?: string): boolean {
    return this.captured.some((cmd) => {
      if (cmd.type !== "artifact.create") return false;
      if (cmd.artifact.type !== type) return false;
      if (jobId && cmd.artifact.job_id !== jobId) return false;
      return true;
    });
  }

  /**
   * Check if workflow enqueued a status update for given job
   * Returns the status if found, null otherwise
   */
  findJobStatusUpdate(jobId: string): JobStatus | null {
    for (const cmd of this.captured) {
      if (cmd.type === "job.updateStatus" && cmd.id === jobId) {
        return cmd.status;
      }
    }
    return null;
  }

  /**
   * Check if workflow enqueued any terminal state (succeeded/failed)
   */
  hasTerminalStatusUpdate(jobId: string): boolean {
    const status = this.findJobStatusUpdate(jobId);
    return status === "succeeded" || status === "failed";
  }
}

/**
 * Enhanced Workflow Context with ISC support
 */
interface EnhancedWorkflowContext {
  repo: ReadOnlyRepo;
  commands: LocalCommandBuffer;
  llm: TracedLLMRuntime | SkillAwareLLMRuntime;
  harness?: TracedHarnessRuntime;
  embeddings?: TracedEmbeddingRuntime;
  nowIso(): string;
  emitArtifact(artifact: {
    type: string;
    job_id?: string | null;
    title?: string | null;
    content_md?: string | null;
    data: Record<string, unknown>;
  }): Promise<void>;
  spawnJob(
    workflowId: string,
    input: Record<string, unknown>,
  ): { jobId: string };
  findArtifacts(query: {
    type?: string;
    tags?: string[];
    jobId?: string;
    since?: string;
    limit?: number;
  }): Artifact[];
  // ISC Integration
  getISC(artifactType: string): ISCDefinition | undefined;
  verifyCriterion(
    criterion: import("../isc/types").IdealStateCriterion,
    artifact: Artifact,
  ): Promise<import("../isc/types").VerificationResult>;
  verifyAllCriteria(
    artifactType: string,
    artifact: Artifact,
  ): Promise<ISCReport>;
  // Effort Level
  getEffortLevel(): EffortLevel;
  // Reflection
  captureReflection(jobId: string, effortLevel: EffortLevel): Promise<void>;
  // PRD
  createPRD(artifact: Artifact, isc: ISCDefinition): Promise<PRD>;
}

/**
 * Job runner - queries queued jobs and executes workflows.
 * Does NOT call writer directly - enqueues commands only.
 * No distributed leasing in MVP; assumes single gateway instance.
 */
export async function runOnce(
  registry: PluginRegistry,
  repo: ReadOnlyRepo,
  commands: CommandQueue,
) {
  const jobs = repo.listJobs({ status: "queued", limit: 10 });

  if (jobs.length === 0) {
    return;
  }

  logInfo("runner.processing", { queued_jobs: jobs.length });

  for (const job of jobs) {
    const workflow = registry.getWorkflow(job.workflow_id);

    if (!workflow) {
      logError("runner.unknown_workflow", {
        job_id: job.id,
        workflow_id: job.workflow_id,
      });
      commands.enqueue({
        type: "job.updateStatus",
        id: job.id,
        status: "failed",
      });
      continue;
    }

    // Create local command buffer for this job execution
    const localCommands = new LocalCommandBuffer();

    // Mark as running via global queue (outside local buffer)
    commands.enqueue({
      type: "job.updateStatus",
      id: job.id,
      status: "running",
    });

    try {
      // Import runtime factories and create workflow context
      const { buildLLMBackendRegistry, buildEmbeddingBackendRegistry } =
        await import("../ai/provider_factory");
      const { buildHarnessBackendRegistry } = await import(
        "../harness/factory"
      );
      const { loadOrDefaultRoutingConfig } = await import("../config");
      const { LLMRouterRuntime } = await import("../routing/llm_router");
      const { HarnessRouterRuntime } = await import(
        "../routing/harness_router"
      );
      const { EmbeddingRouterRuntime } = await import(
        "../routing/embedding_router"
      );
      const { GatedLLMRuntime } = await import("../ai/gated_llm_runtime");
      const { SkillAwareLLMRuntime } = await import(
        "../ai/skill_aware_llm_runtime"
      );
      const { GatedEmbeddingRuntime } = await import(
        "../ai/gated_embedding_runtime"
      );
      const { GatedHarnessRuntime } = await import(
        "../harness/gated_harness_runtime"
      );
      const { createWorkflowPolicy } = await import("../core/policy");
      const {
        loadAgentsFiles,
        loadSkillRegistry,
        resolveAgentsPaths,
        resolveAutoSkillsDefault,
        resolveSkillContextLimit,
        resolveSkillPaths,
      } = await import("../skills");

      // Load routing configuration
      const routingConfig = await loadOrDefaultRoutingConfig();

      // Determine effort level from job input or routing profile
      const jobEffortLevel = (job.input?.effort_level as EffortLevel) || null;
      const defaultProfile =
        Object.keys(routingConfig.llm?.profiles || {})[0] || "balanced";
      const effortLevel: EffortLevel =
        jobEffortLevel ||
        profileToEffortLevel((job.input?.profile as string) || defaultProfile);

      // Create policy first (needed for harness registry)
      const policy = createWorkflowPolicy(workflow.capabilities);

      // Build backend registries
      const llmRegistry = await buildLLMBackendRegistry();
      const embeddingRegistry = await buildEmbeddingBackendRegistry();
      const harnessRegistry = buildHarnessBackendRegistry(
        policy,
        routingConfig,
      );

      // Create router runtimes
      const llmRouter = new LLMRouterRuntime(routingConfig.llm, llmRegistry);
      const embeddingRouter = new EmbeddingRouterRuntime(
        routingConfig.embeddings,
        embeddingRegistry,
      );
      const harnessRouter = new HarnessRouterRuntime(
        routingConfig.harness,
        harnessRegistry,
      );

      // Create gated runtimes
      const gatedLLM = new GatedLLMRuntime(llmRouter, policy);
      const gatedEmbeddings = new GatedEmbeddingRuntime(
        embeddingRouter,
        policy,
      );
      const gatedHarness = new GatedHarnessRuntime(harnessRouter, policy);
      const trace = createTraceEmitter(localCommands, {
        trace_id: job.id,
        job_id: job.id,
        workflow_id: job.workflow_id,
      });
      const skillRegistry = await loadSkillRegistry({
        paths: resolveSkillPaths(),
      });
      const agentsFiles = await loadAgentsFiles(resolveAgentsPaths());
      const agentsInstructions = agentsFiles
        .map((file) => file.content)
        .join("\n\n");
      const skillAwareLLM = new SkillAwareLLMRuntime(
        new TracedLLMRuntime(gatedLLM, trace),
        {
          registry: skillRegistry,
          agentsInstructions: agentsInstructions || undefined,
          autoSkillsDefault: resolveAutoSkillsDefault(),
          maxContextChars: resolveSkillContextLimit(),
        },
      );
      const tracedEmbeddings = new TracedEmbeddingRuntime(
        gatedEmbeddings,
        trace,
      );
      const tracedHarness = new TracedHarnessRuntime(gatedHarness, trace);

      // Initialize Budget Tracker
      const budgetTracker = new BudgetTracker(job.id, effortLevel);

      // Initialize Verification Engine
      const verificationEngine = new VerificationEngine(
        skillAwareLLM,
        repo,
        db,
      );

      // Initialize Reflection Capture
      const reflectionCapture = new ReflectionCapture(
        localCommands,
        repo,
        skillAwareLLM,
      );

      // Initialize PRD Storage
      const prdStorage = new PRDStorage();

      // Helper to flush local commands to global queue
      const flushLocalCommands = () => {
        const cmds = localCommands.drain();
        for (const cmd of cmds) {
          commands.enqueue(cmd);
        }
      };

      const ensureApprovalArtifact = (reason: string) => {
        if (
          localCommands.hasArtifactType(
            "checkpoint.approval_request.v1",
            job.id,
          )
        ) {
          return;
        }

        localCommands.enqueue({
          type: "artifact.create",
          artifact: {
            type: "checkpoint.approval_request.v1",
            job_id: job.id,
            title: "Approval Required",
            content_md: `Job ${job.id} (${job.workflow_id}) requires approval before completion.`,
            data: {
              schema_version: "1.0",
              produced_by: "runner",
              workflow_id: job.workflow_id,
              reason,
              requested_at: new Date().toISOString(),
            },
          },
        });
      };

      // ISC-aware emitArtifact function
      const emitArtifact = async (a: {
        type: string;
        job_id?: string | null;
        title?: string | null;
        content_md?: string | null;
        data: Record<string, unknown>;
      }): Promise<void> => {
        // Create artifact object for verification
        const artifactForVerification: Artifact = {
          id: `art_${ulid()}`,
          type: a.type,
          job_id: a.job_id ?? null,
          title: a.title ?? null,
          content_md: a.content_md ?? null,
          data: { ...a.data },
          created_at: new Date().toISOString(),
        };

        // Get ISC for this artifact type
        const isc = globalISCRegistry.getCriteria(a.type);

        let iscReport: ISCReport | undefined;

        if (isc) {
          // Verify against ISC before emission
          trace.event(
            "isc.verification.start",
            { artifact_type: a.type, criteria_count: isc.idealCriteria.length },
            "ISC verification starting",
            "start",
          );

          iscReport = await verificationEngine.verifyAllCriteria(
            isc,
            artifactForVerification,
            job.id,
            workflow.id,
          );

          // Attach ISC report to artifact data
          artifactForVerification.data.isc_report = {
            passed: iscReport.passed,
            criteria_count: iscReport.criteriaResults.length,
            passed_count: iscReport.criteriaResults.filter((r) => r.passed)
              .length,
            report_id: iscReport.id,
          };

          trace.event(
            "isc.verification.end",
            {
              passed: iscReport.passed,
              criteria_passed: iscReport.criteriaResults.filter((r) => r.passed)
                .length,
            },
            iscReport.passed
              ? "ISC verification passed"
              : "ISC verification failed",
            iscReport.passed ? "ok" : "failed",
          );

          // Fail-closed: Don't emit if CRITICAL criteria fail
          const criticalFailures = iscReport.criteriaResults.filter((r) => {
            if (!r.passed) {
              const criterion = isc.idealCriteria.find(
                (c) => c.id === r.criterionId,
              );
              return criterion?.priority === "CRITICAL";
            }
            return false;
          });

          if (criticalFailures.length > 0) {
            const failureIds = criticalFailures.map((f) => f.criterionId);
            throw new Error(
              `Artifact failed ${criticalFailures.length} CRITICAL ISC criteria: ${failureIds.join(", ")}`,
            );
          }
        }

        // Emit artifact
        localCommands.enqueue({
          type: "artifact.create",
          artifact: a,
        });

        // Create PRD for the artifact
        if (isc && iscReport) {
          const prd: PRD = {
            id: PRDStorage.generateId(a.type.replace(/\./g, "-")),
            artifactId: artifactForVerification.id,
            workflowId: workflow.id,
            jobId: job.id,
            status: iscReport.passed ? "COMPLETE" : "FAILED",
            effortLevel,
            title: a.title || `Artifact: ${a.type}`,
            problemSpace: `Generated by ${workflow.id}`,
            keyFiles: [],
            constraints: [],
            decisions: [],
            idealCriteria: isc.idealCriteria,
            antiCriteria: isc.antiCriteria,
            iteration: 1,
            maxIterations: 10,
            lastPhase: "VERIFY",
            failingCriteria: iscReport.criteriaResults
              .filter((r) => !r.passed)
              .map((r) => r.criterionId),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            log: [
              {
                iteration: 1,
                date: new Date().toISOString(),
                phase: iscReport.passed ? "COMPLETE" : "FAILED",
                criteriaProgress: `${iscReport.criteriaResults.filter((r) => r.passed).length}/${iscReport.criteriaResults.length}`,
                workDone: "Artifact generated with ISC verification",
                failing: iscReport.criteriaResults
                  .filter((r) => !r.passed)
                  .map((r) => r.criterionId),
                context: `Effort level: ${effortLevel}`,
              },
            ],
          };

          prdStorage.create(prd);

          localCommands.enqueue({
            type: "prd.create",
            prd,
          });
        }
      };

      // Create PRD helper
      const createPRD = async (
        artifact: Artifact,
        isc: ISCDefinition,
      ): Promise<PRD> => {
        const prd: PRD = {
          id: PRDStorage.generateId(artifact.type.replace(/\./g, "-")),
          artifactId: artifact.id,
          workflowId: workflow.id,
          jobId: job.id,
          status: "COMPLETE",
          effortLevel,
          title: artifact.title || `Artifact: ${artifact.type}`,
          problemSpace: `Generated by ${workflow.id}`,
          keyFiles: [],
          constraints: [],
          decisions: [],
          idealCriteria: isc.idealCriteria,
          antiCriteria: isc.antiCriteria,
          iteration: 1,
          maxIterations: 10,
          lastPhase: "COMPLETE",
          failingCriteria: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          log: [],
        };

        prdStorage.create(prd);

        localCommands.enqueue({
          type: "prd.create",
          prd,
        });

        return prd;
      };

      const ctx: EnhancedWorkflowContext = {
        repo,
        commands: localCommands,
        llm: skillAwareLLM,
        harness: tracedHarness,
        embeddings: tracedEmbeddings,
        nowIso: () => new Date().toISOString(),

        emitArtifact,

        spawnJob(workflowId: string, input: Record<string, unknown>) {
          const jobId = `job_${ulid()}`;
          localCommands.enqueue({
            type: "job.create",
            job: { id: jobId, workflow_id: workflowId, input },
          });
          return { jobId };
        },

        findArtifacts(query: {
          type?: string;
          tags?: string[];
          jobId?: string;
          since?: string;
          limit?: number;
        }) {
          return repo.findArtifacts({
            type: query.type,
            jobId: query.jobId,
            since: query.since,
            limit: query.limit,
          });
        },

        // ISC Integration
        getISC(artifactType: string): ISCDefinition | undefined {
          // First check workflow's own ISC definition
          const workflowWithISC = workflow as { isc?: ISCDefinition };
          if (workflowWithISC.isc) {
            return workflowWithISC.isc;
          }
          // Then check global registry
          return globalISCRegistry.getCriteria(artifactType);
        },

        async verifyCriterion(criterion, artifact) {
          return verificationEngine.verifyCriterion(criterion, artifact, {
            jobId: job.id,
            workflowId: workflow.id,
          });
        },

        async verifyAllCriteria(artifactType, artifact) {
          const isc = globalISCRegistry.getCriteria(artifactType);
          if (!isc) {
            throw new Error(`No ISC definition found for ${artifactType}`);
          }
          return verificationEngine.verifyAllCriteria(
            isc,
            artifact,
            job.id,
            workflow.id,
          );
        },

        // Effort Level
        getEffortLevel(): EffortLevel {
          return effortLevel;
        },

        // Reflection
        async captureReflection(
          jobId: string,
          effortLevel: EffortLevel,
        ): Promise<void> {
          // Only capture for STANDARD+ effort levels
          if (effortLevel === "INSTANT" || effortLevel === "FAST") {
            return;
          }

          // Get the most recent ISC report for this job
          const iscReport = undefined; // Would query from repo

          await reflectionCapture.capture(jobId, effortLevel, iscReport);
        },

        createPRD,
      };

      // Execute workflow
      trace.event(
        "workflow.start",
        {
          input_keys: Object.keys(job.input ?? {}),
          effort_level: effortLevel,
        },
        "Workflow start",
        "start",
      );

      // Log budget status at start
      budgetTracker.logStatus();

      await workflow.run(ctx, job.input, job.id);
      trace.event("workflow.end", { status: "ok" }, "Workflow end", "ok");

      // Capture reflection for STANDARD+ effort levels
      if (effortLevel !== "INSTANT" && effortLevel !== "FAST") {
        try {
          await ctx.captureReflection(job.id, effortLevel);
        } catch (error) {
          logError("runner.reflection_failed", {
            job_id: job.id,
            error,
          });
        }
      }

      // Log final budget status
      budgetTracker.logStatus();

      // Check if workflow already enqueued a status update (e.g., needs_approval)
      const workflowStatus = localCommands.findJobStatusUpdate(job.id);

      // If workflow requested terminal/non-auto status, respect it
      if (
        workflowStatus === "succeeded" ||
        workflowStatus === "failed" ||
        workflowStatus === "needs_approval"
      ) {
        // Workflow already set final status, don't override
        logInfo("runner.workflow_status_set", {
          job_id: job.id,
          workflow_id: job.workflow_id,
          status: workflowStatus,
        });
        if (workflowStatus === "needs_approval") {
          ensureApprovalArtifact("workflow_requested");
        }
      } else {
        // Check if workflow has a verifier hook
        if (workflow.verify) {
          // Move to verifying phase
          localCommands.enqueue({
            type: "job.updateStatus",
            id: job.id,
            status: "verifying",
          });

          logInfo("runner.verify_start", {
            job_id: job.id,
            workflow_id: job.workflow_id,
          });
          trace.event(
            "workflow.verify_start",
            undefined,
            "Verification start",
            "start",
          );

          try {
            // Call the verification hook
            await workflow.verify(ctx, job.input, job.id);

            // Check if verify() set a status
            const verifyStatus = localCommands.findJobStatusUpdate(job.id);

            if (
              verifyStatus === "succeeded" ||
              verifyStatus === "failed" ||
              verifyStatus === "needs_approval"
            ) {
              // Verify hook set a terminal status - respect it
              logInfo("runner.verify_status_set", {
                job_id: job.id,
                status: verifyStatus,
              });
              trace.event(
                "workflow.verify_end",
                { status: verifyStatus },
                "Verification end",
                verifyStatus,
              );
              if (verifyStatus === "needs_approval") {
                ensureApprovalArtifact("verification_requested");
              }
            } else {
              // No status set by verify, mark as succeeded
              localCommands.enqueue({
                type: "job.updateStatus",
                id: job.id,
                status: "succeeded",
              });
              logInfo("runner.verify_passed", { job_id: job.id });
              trace.event(
                "workflow.verify_end",
                { status: "succeeded" },
                "Verification end",
                "succeeded",
              );
            }
          } catch (verifyError) {
            logError("runner.verify_failed", {
              job_id: job.id,
              error: verifyError,
            });
            trace.event(
              "workflow.verify_end",
              { status: "failed" },
              "Verification failed",
              "failed",
            );

            // Mark as failed
            localCommands.enqueue({
              type: "job.updateStatus",
              id: job.id,
              status: "failed",
            });
          }
        } else {
          // No verifier hook, check approval policy
          const requireApprovalByDefault =
            process.env.ATLAS_REQUIRE_APPROVAL_BY_DEFAULT === "true";

          if (requireApprovalByDefault) {
            localCommands.enqueue({
              type: "job.updateStatus",
              id: job.id,
              status: "needs_approval",
            });
            ensureApprovalArtifact("default_policy");
            logInfo("runner.approval_required", {
              job_id: job.id,
              workflow_id: job.workflow_id,
            });
          } else {
            // No verifier hook, mark as succeeded
            localCommands.enqueue({
              type: "job.updateStatus",
              id: job.id,
              status: "succeeded",
            });
            logInfo("runner.auto_succeeded", {
              job_id: job.id,
              workflow_id: job.workflow_id,
            });
          }
        }
      }

      // Flush all local commands to global queue
      flushLocalCommands();
    } catch (error) {
      logError("runner.job_failed", {
        job_id: job.id,
        workflow_id: job.workflow_id,
        error,
      });
      try {
        const trace = createTraceEmitter(localCommands, {
          trace_id: job.id,
          job_id: job.id,
          workflow_id: job.workflow_id,
        });
        trace.event(
          "workflow.error",
          { error: error instanceof Error ? error.message : String(error) },
          "Workflow error",
          "error",
        );
      } catch {
        // avoid failing on trace emit
      }

      // Flush any pending commands first (to preserve artifact creation, etc.)
      const pendingCommands = localCommands.drain();
      for (const cmd of pendingCommands) {
        commands.enqueue(cmd);
      }

      // Mark as failed
      commands.enqueue({
        type: "job.updateStatus",
        id: job.id,
        status: "failed",
      });
    }
  }
}
