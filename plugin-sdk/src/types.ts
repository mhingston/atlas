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

export type DomainEvent = {
  id: string;
  type: string;
  created_at: IsoDate;
  aggregate_id?: string | null;
  payload: Record<string, unknown>;
};

export type TraceEvent = {
  id: string;
  trace_id: string;
  job_id?: string | null;
  workflow_id?: string | null;
  kind: string;
  message?: string | null;
  span_id?: string | null;
  parent_span_id?: string | null;
  status?: string | null;
  started_at?: IsoDate | null;
  ended_at?: IsoDate | null;
  duration_ms?: number | null;
  data: Record<string, unknown>;
  created_at: IsoDate;
};

export type NewArtifact = {
  type: string;
  job_id?: string | null;
  title?: string | null;
  content_md?: string | null;
  data: Record<string, unknown>;
};

export type PartialArtifact = Partial<
  Pick<NewArtifact, "title" | "content_md" | "data">
>;

export type NewJob = {
  id: string;
  workflow_id: string;
  input: Record<string, unknown>;
};

export type PrunePolicy = {
  delivered_domain_events_days?: number;
  jobs_days?: number;
  artifacts_days?: number;
  events_days?: number;
  traces_days?: number;
};

export type EmbeddingData = {
  id: string;
  owner_type: "artifact" | "entity";
  owner_id: string;
  provider: string;
  model: string;
  dims: number;
  vector: number[];
  content_hash: string;
  created_at: string;
  updated_at: string;
};

// ==========================================================================
// Core Runtime Interfaces (mirrored from atlas core)
// ==========================================================================

export interface CommandQueue {
  enqueue(command: Command): void;
}

export interface ReadOnlyRepo {
  getArtifact(id: string): Artifact | null;
  getEntity(id: string): Entity | null;
  getEmbeddingsByOwner(
    ownerType: "artifact" | "entity",
    ownerId: string,
  ): EmbeddingData[];
  listJobs(query?: {
    status?: JobStatus;
    limit?: number;
  }): Job[];
  listEntities(query: {
    type?: string;
    source?: string;
    limit?: number;
  }): Entity[];
  findArtifacts(query: {
    type?: string;
    tags?: string[];
    jobId?: string;
    since?: string;
    before?: string;
    beforeId?: string;
    limit?: number;
  }): Artifact[];
  listEmbeddings(query: {
    owner_type?: "artifact" | "entity";
    since?: string;
    limit?: number;
  }): EmbeddingData[];
}

export type LLMRuntime = {
  generateText(args: {
    system?: string;
    prompt: string;
    model?: string;
    profile?: "fast" | "balanced" | "quality";
    tags?: string[];
    skills?: string[];
    autoSkills?: boolean;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{
    text: string;
    provider: string;
    model?: string;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
  }>;
};

export type EmbeddingRuntime = {
  embedText(args: {
    texts: string[];
    profile?: "fast" | "balanced" | "quality";
  }): Promise<{
    vectors: number[][];
    provider: string;
    model?: string;
    dims: number;
  }>;
};

export type HarnessRuntime = {
  runTask(args: {
    harnessId?: string;
    goal: string;
    cwd: string;
    contextPaths?: string[];
    mode?: "plan" | "propose" | "apply";
    profile?: "fast" | "balanced" | "quality";
    tags?: string[];
    budget?: {
      maxMinutes?: number;
    };
  }): Promise<{
    mode: "plan" | "propose" | "apply";
    summary: string;
    outputs: Array<
      | { type: "text"; title?: string; content: string }
      | { type: "diff"; title?: string; diff: string }
      | { type: "file"; path: string; content: string }
      | {
          type: "command_log";
          entries: Array<{
            cmd: string;
            exitCode?: number;
            out?: string;
            err?: string;
          }>;
        }
    >;
    provider?: string;
    meta?: Record<string, unknown>;
  }>;
};

// ============================================================================
// Plugin Component Types
// ============================================================================

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
  repo: ReadOnlyRepo;
  commands: CommandQueue;
  nowIso(): string;
};

export type Command =
  | { type: "entity.upsert"; entity: Entity }
  | { type: "event.insert"; event: Event }
  | { type: "artifact.create"; artifact: NewArtifact }
  | { type: "artifact.update"; id: string; patch: PartialArtifact }
  | { type: "job.create"; job: NewJob }
  | { type: "job.updateStatus"; id: string; status: JobStatus }
  | { type: "domainEvent.emit"; event: DomainEvent }
  | { type: "domainEvent.markDelivered"; id: string }
  | { type: "maintenance.prune"; policy: PrunePolicy }
  | { type: "embedding.upsert"; data: EmbeddingData }
  | {
      type: "embedding.deleteByOwner";
      owner_type: "artifact" | "entity";
      owner_id: string;
    }
  | { type: "trace.emit"; event: TraceEvent };

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
