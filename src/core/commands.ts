import type {
  DomainEvent,
  Entity,
  Event,
  JobStatus,
  TraceEvent,
} from "./types";

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
  delivered_domain_events_days?: number; // default 7
  jobs_days?: number; // default 30
  artifacts_days?: number; // default 90
  events_days?: number; // default 60
  traces_days?: number; // default 30
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
