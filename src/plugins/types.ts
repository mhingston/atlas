import type {
  CommandQueue,
  EmbeddingRuntime,
  HarnessRuntime,
  LLMRuntime,
  ReadOnlyRepo,
  WorkflowPlugin as SDKWorkflowPlugin,
  SinkContext,
  SinkPlugin,
  SourceContext,
  SourcePlugin,
  WorkflowContext,
} from "@mhingston5/atlas-plugin-sdk";
import type { Capability } from "../core/policy";

export type {
  SinkContext,
  SinkPlugin,
  SourceContext,
  SourcePlugin,
  WorkflowContext,
};

export type SDKCommandQueue = CommandQueue;
export type SDKReadOnlyRepo = ReadOnlyRepo;
export type SDKLLMRuntime = LLMRuntime;
export type SDKEmbeddingRuntime = EmbeddingRuntime;
export type SDKHarnessRuntime = HarnessRuntime;

export interface WorkflowPlugin extends SDKWorkflowPlugin {
  /**
   * Optional list of capabilities required by this workflow.
   * If omitted, defaults are used (db:read, llm:generate, embeddings:generate).
   * If provided, only db:read + the listed capabilities are granted.
   */
  capabilities?: Capability[];
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
