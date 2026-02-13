/**
 * Atlas Plugin SDK - Core Types
 *
 * This module defines the interfaces that all Atlas plugins must implement.
 * These types are used by both the plugin author and the Atlas core runtime.
 */

// ============================================================================
// Core Entity Types (mirrored from atlas core)
// ============================================================================

export type IsoDate = string;

export type Entity = {
  id: string;
  type: string;
  source: string;
  title?: string | null;
  url?: string | null;
  status?: string | null;
  updated_at: IsoDate;
  data: Record<string, unknown>;
};

export type Event = {
  id: string;
  entity_id: string;
  type: string;
  actor?: string | null;
  created_at: IsoDate;
  body?: string | null;
  data: Record<string, unknown>;
};

export type Artifact = {
  id: string;
  type: string;
  job_id?: string | null;
  title?: string | null;
  content_md?: string | null;
  data: Record<string, unknown>;
  created_at: IsoDate;
};

export type JobStatus =
  | "queued"
  | "running"
  | "verifying"
  | "needs_approval"
  | "succeeded"
  | "failed";

export type Job = {
  id: string;
  workflow_id: string;
  status: JobStatus;
  input: Record<string, unknown>;
  started_at?: IsoDate | null;
  finished_at?: IsoDate | null;
  log?: Record<string, unknown> | null;
};

// ============================================================================
// Plugin Component Types
// ============================================================================

export type SourceContext = {
  nowIso(): string;
  commands: {
    enqueue(command: Command): void;
  };
};

export type WorkflowContext = {
  repo: {
    getArtifact(id: string): Artifact | null;
    getEntity(id: string): Entity | null;
    getEmbeddingsByOwner(
      ownerType: string,
      ownerId: string,
    ): Array<{ vector: number[] }>;
    listJobs(query?: {
      status?: string;
      limit?: number;
    }): Job[];
  };
  commands: {
    enqueue(command: Command): void;
  };
  llm: {
    generateText(args: {
      prompt: string;
      temperature?: number;
      maxTokens?: number;
      profile?: "fast" | "balanced" | "quality";
    }): Promise<{
      text: string;
      provider: string;
      usage?: {
        promptTokens?: number;
        completionTokens?: number;
      };
    }>;
  };
  embeddings?: {
    generateEmbedding(text: string): Promise<number[]>;
  };
  harness?: {
    execute(args: {
      command: string;
      args?: string[];
      cwd?: string;
    }): Promise<{
      stdout: string;
      stderr: string;
      exitCode: number;
    }>;
  };
  nowIso(): string;
  emitArtifact(artifact: {
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
  repo: {
    getArtifact(id: string): Artifact | null;
  };
  commands: {
    enqueue(command: Command): void;
  };
};

export type Command =
  | { type: "entity.upsert"; entity: Entity }
  | { type: "entity.delete"; id: string }
  | { type: "event.create"; event: Event }
  | { type: "artifact.create"; artifact: Artifact }
  | { type: "artifact.update"; id: string; patch: Partial<Artifact> }
  | { type: "job.create"; job: Job }
  | { type: "job.update"; id: string; status: JobStatus; log?: unknown };

// ============================================================================
// Plugin Interface Types
// ============================================================================

export type SourcePlugin = {
  id: string;
  sync(ctx: SourceContext): Promise<void>;
};

export type WorkflowPlugin = {
  id: string;
  run(
    ctx: WorkflowContext,
    input: Record<string, unknown>,
    jobId: string,
  ): Promise<void>;
};

export type SinkPlugin = {
  id: string;
  flush(ctx: SinkContext, artifacts: Artifact[]): Promise<void>;
};

// ============================================================================
// External Plugin Types (for loading external plugins)
// ============================================================================

export interface ExternalPlugin {
  manifest: PluginManifest;
  initialize?(config: PluginConfig): Promise<void>;
  shutdown?(): Promise<void>;
  health?(): Promise<PluginHealth>;
  sources?: SourcePlugin[];
  workflows?: WorkflowPlugin[];
  sinks?: SinkPlugin[];
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: string;
  description?: string;
  author?: string;
  license?: string;
  entry: string;
  types?: string;
  exports?: {
    sources?: string[];
    workflows?: string[];
    sinks?: string[];
  };
  config?: {
    schema: Record<string, ConfigSchema>;
  };
  dependencies?: Record<string, string>;
  minCoreVersion?: string;
}

export interface ConfigSchema {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  default?: unknown;
  required?: boolean;
  secret?: boolean;
  items?: ConfigSchema;
  properties?: Record<string, ConfigSchema>;
}

export interface PluginConfig {
  id: string;
  source: string;
  settings: Record<string, unknown>;
  enabled: boolean;
}

export interface PluginHealth {
  status: "healthy" | "degraded" | "unhealthy";
  message?: string;
  checks?: Array<{
    name: string;
    status: "pass" | "fail" | "warn";
    message?: string;
  }>;
}

// ============================================================================
// Version Constants
// ============================================================================

export const CURRENT_API_VERSION = "1.0";
export const SDK_VERSION = "1.0.0";

// ============================================================================
// Utility Types
// ============================================================================

export type PluginSourceType = "npm" | "github" | "local" | "url";

export interface PluginLoadResult {
  success: boolean;
  plugin?: ExternalPlugin;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
