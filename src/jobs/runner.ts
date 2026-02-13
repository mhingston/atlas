import { TracedEmbeddingRuntime } from "../ai/traced_embedding_runtime";
import { TracedLLMRuntime } from "../ai/traced_llm_runtime";
import type { Command } from "../core/commands";
import { logError, logInfo } from "../core/logger";
import { CommandQueue } from "../core/queue";
import type { ReadOnlyRepo } from "../core/repo";
import { createTraceEmitter } from "../core/trace";
import type { JobStatus } from "../core/types";
import { TracedHarnessRuntime } from "../harness/traced_harness_runtime";
import type { PluginRegistry } from "../plugins/registry";

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
      const { ulid } = await import("ulid");

      // Load routing configuration
      const routingConfig = await loadOrDefaultRoutingConfig();

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
      const requireApprovalByDefault =
        process.env.ATLAS_REQUIRE_APPROVAL_BY_DEFAULT === "true";

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

      const ctx = {
        repo,
        commands: localCommands,
        llm: skillAwareLLM,
        harness: tracedHarness,
        embeddings: tracedEmbeddings,
        nowIso: () => new Date().toISOString(),

        emitArtifact(a: {
          type: string;
          job_id?: string | null;
          title?: string | null;
          content_md?: string | null;
          data: Record<string, unknown>;
        }) {
          localCommands.enqueue({
            type: "artifact.create",
            artifact: a,
          });
        },

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
      };

      // Execute workflow
      trace.event(
        "workflow.start",
        {
          input_keys: Object.keys(job.input ?? {}),
        },
        "Workflow start",
        "start",
      );
      await workflow.run(ctx, job.input, job.id);
      trace.event("workflow.end", { status: "ok" }, "Workflow end", "ok");

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
