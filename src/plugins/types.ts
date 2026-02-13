import type { EmbeddingRuntime } from "../ai/embedding_runtime";
import type { LLMRuntime } from "../ai/llm_runtime";
import type { Capability } from "../core/policy";
import type { CommandQueue } from "../core/queue";
import type { ReadOnlyRepo } from "../core/repo";
import type { Artifact } from "../core/types";
import type { HarnessRuntime } from "../harness/types";

export type SourceContext = {
  repo: ReadOnlyRepo;
  commands: CommandQueue;
  nowIso(): string;
};

export type WorkflowContext = {
  repo: ReadOnlyRepo;
  commands: CommandQueue;
  llm: LLMRuntime;
  harness?: HarnessRuntime;
  embeddings?: EmbeddingRuntime;
  nowIso(): string;

  // Composition helpers
  emitArtifact(a: {
    type: string;
    job_id?: string | null;
    title?: string | null;
    content_md?: string | null;
    data: Record<string, unknown>;
  }): void;

  spawnJob(
    workflowId: string,
    input: Record<string, unknown>,
  ): { jobId: string };

  findArtifacts(query: {
    type?: string;
    tags?: string[];
    jobId?: string;
    since?: string;
    before?: string;
    beforeId?: string;
    limit?: number;
  }): Artifact[];
};

export type SinkContext = {
  repo: ReadOnlyRepo;
  commands: CommandQueue;
  nowIso(): string;
};

export interface SourcePlugin {
  id: string;
  sync(ctx: SourceContext): Promise<void>;
}

export interface WorkflowPlugin {
  id: string;
  /**
   * Optional list of capabilities required by this workflow.
   * If omitted, defaults are used (db:read, llm:generate, embeddings:generate).
   * If provided, only db:read + the listed capabilities are granted.
   */
  capabilities?: Capability[];
  run(
    ctx: WorkflowContext,
    input: Record<string, unknown>,
    jobId: string,
  ): Promise<void>;
  /**
   * Optional verification hook - called after run() completes successfully.
   * Allows workflows to perform domain-specific verification (e.g., run tests,
   * sanity-check citations, etc.) before marking job as succeeded.
   */
  verify?(
    ctx: WorkflowContext,
    input: Record<string, unknown>,
    jobId: string,
  ): Promise<void>;
}

export interface SinkPlugin {
  id: string;
  handle(
    domainEvent: {
      id: string;
      type: string;
      created_at: string;
      aggregate_id?: string | null;
      payload: Record<string, unknown>;
    },
    ctx: SinkContext,
  ): Promise<void>;
}
