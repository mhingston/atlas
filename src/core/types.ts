export type IsoDate = string;

export type Entity = {
  id: string;
  type: string; // e.g. github.pr, raindrop.bookmark
  source: string; // plugin id
  title?: string | null;
  url?: string | null;
  status?: string | null;
  updated_at: IsoDate;
  data: Record<string, unknown>;
};

export type Event = {
  id: string; // stable hash
  entity_id: string;
  type: string; // plugin-defined
  actor?: string | null;
  created_at: IsoDate;
  body?: string | null;
  data: Record<string, unknown>;
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

export type Artifact = {
  id: string;
  type: string; // schema name, e.g. brainstorm.session.v1
  job_id?: string | null;
  title?: string | null;
  content_md?: string | null;
  data: Record<string, unknown>;
  created_at: IsoDate;
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
