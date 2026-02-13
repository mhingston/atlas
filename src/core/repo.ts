import type { Database } from "bun:sqlite";
import type { EmbeddingData } from "./commands";
import type {
  Artifact,
  Entity,
  Event,
  Job,
  JobStatus,
  TraceEvent,
} from "./types";

type DbParam = string | number | null;

type EntityRow = {
  id: string;
  type: string;
  source: string | null;
  title: string | null;
  url: string | null;
  status: string | null;
  updated_at: string;
  data_json: string;
};

type EventRow = {
  id: string;
  entity_id: string;
  type: string;
  actor: string | null;
  created_at: string;
  body: string | null;
  data_json: string;
};

type JobRow = {
  id: string;
  workflow_id: string;
  status: string;
  input_json: string;
  started_at: string | null;
  finished_at: string | null;
  log_json: string | null;
};

type ArtifactRow = {
  id: string;
  type: string;
  job_id: string | null;
  title: string | null;
  content_md: string | null;
  data_json: string;
  created_at: string;
};

type EmbeddingRow = {
  id: string;
  owner_type: "artifact" | "entity";
  owner_id: string;
  provider: string;
  model: string | null;
  dims: number;
  vector_json: string;
  content_hash: string;
  created_at: string;
  updated_at: string;
};

type TraceEventRow = {
  id: string;
  trace_id: string;
  job_id: string | null;
  workflow_id: string | null;
  kind: string;
  message: string | null;
  span_id: string | null;
  parent_span_id: string | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  data_json: string | null;
  created_at: string;
};

export class ReadOnlyRepo {
  constructor(private db: Database) {}

  getEntity(id: string): Entity | null {
    const row = this.db
      .prepare("SELECT * FROM entities WHERE id = ?")
      .get(id) as EntityRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      source: row.source ?? "unknown",
      title: row.title,
      url: row.url,
      status: row.status,
      updated_at: row.updated_at,
      data: JSON.parse(row.data_json),
    };
  }

  listEntities(filter: {
    type?: string;
    source?: string;
    limit?: number;
  }): Entity[] {
    let sql = "SELECT * FROM entities WHERE 1=1";
    const params: DbParam[] = [];

    if (filter.type) {
      sql += " AND type = ?";
      params.push(filter.type);
    }
    if (filter.source) {
      sql += " AND source = ?";
      params.push(filter.source);
    }
    sql += " ORDER BY updated_at DESC";
    if (filter.limit) {
      sql += " LIMIT ?";
      params.push(filter.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as EntityRow[];
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      source: row.source ?? "unknown",
      title: row.title,
      url: row.url,
      status: row.status,
      updated_at: row.updated_at,
      data: JSON.parse(row.data_json),
    }));
  }

  getEvents(
    entityId: string,
    opts?: { since?: string; limit?: number },
  ): Event[] {
    let sql = "SELECT * FROM events WHERE entity_id = ?";
    const params: DbParam[] = [entityId];

    if (opts?.since) {
      sql += " AND created_at > ?";
      params.push(opts.since);
    }
    sql += " ORDER BY created_at DESC";
    if (opts?.limit) {
      sql += " LIMIT ?";
      params.push(opts.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as EventRow[];
    return rows.map((row) => ({
      id: row.id,
      entity_id: row.entity_id,
      type: row.type,
      actor: row.actor,
      created_at: row.created_at,
      body: row.body,
      data: JSON.parse(row.data_json),
    }));
  }

  getJob(id: string): Job | null {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as
      | JobRow
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      workflow_id: row.workflow_id,
      status: row.status as JobStatus,
      input: JSON.parse(row.input_json),
      started_at: row.started_at,
      finished_at: row.finished_at,
      log: row.log_json ? JSON.parse(row.log_json) : null,
    };
  }

  listJobs(filter: {
    status?: JobStatus;
    limit?: number;
    afterId?: string;
  }): Job[] {
    let sql = "SELECT * FROM jobs WHERE 1=1";
    const params: DbParam[] = [];

    if (filter.status) {
      sql += " AND status = ?";
      params.push(filter.status);
    }
    if (filter.afterId) {
      sql += " AND id < ?";
      params.push(filter.afterId);
    }
    sql += " ORDER BY id DESC";
    const limit = filter.limit ?? 20;
    sql += " LIMIT ?";
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as JobRow[];
    return rows.map((row) => ({
      id: row.id,
      workflow_id: row.workflow_id,
      status: row.status as JobStatus,
      input: JSON.parse(row.input_json),
      started_at: row.started_at,
      finished_at: row.finished_at,
      log: row.log_json ? JSON.parse(row.log_json) : null,
    }));
  }

  countJobsByStatus(filter?: { workflowId?: string }): Record<string, number> {
    const statuses = [
      "queued",
      "running",
      "verifying",
      "needs_approval",
      "succeeded",
      "failed",
    ];
    const counts: Record<string, number> = {};

    for (const status of statuses) {
      let sql = "SELECT COUNT(*) as count FROM jobs WHERE status = ?";
      const params: DbParam[] = [status];
      if (filter?.workflowId) {
        sql += " AND workflow_id = ?";
        params.push(filter.workflowId);
      }
      const row = this.db.prepare(sql).get(...params) as
        | { count: number }
        | undefined;
      counts[status] = row?.count ?? 0;
    }

    return counts;
  }

  getArtifact(id: string): Artifact | null {
    const row = this.db
      .prepare("SELECT * FROM artifacts WHERE id = ?")
      .get(id) as ArtifactRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      job_id: row.job_id,
      title: row.title,
      content_md: row.content_md,
      data: JSON.parse(row.data_json),
      created_at: row.created_at,
    };
  }

  findArtifacts(filter: {
    type?: string;
    jobId?: string;
    since?: string;
    before?: string;
    beforeId?: string;
    limit?: number;
  }): Artifact[] {
    let sql = "SELECT * FROM artifacts WHERE 1=1";
    const params: DbParam[] = [];

    if (filter.type) {
      sql += " AND type = ?";
      params.push(filter.type);
    }
    if (filter.jobId) {
      sql += " AND job_id = ?";
      params.push(filter.jobId);
    }
    if (filter.since) {
      sql += " AND created_at > ?";
      params.push(filter.since);
    }
    if (filter.before && filter.beforeId) {
      sql += " AND (created_at < ? OR (created_at = ? AND id < ?))";
      params.push(filter.before, filter.before, filter.beforeId);
    } else if (filter.before) {
      sql += " AND created_at < ?";
      params.push(filter.before);
    }
    sql += " ORDER BY created_at DESC";
    if (filter.limit) {
      sql += " LIMIT ?";
      params.push(filter.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as ArtifactRow[];
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      job_id: row.job_id,
      title: row.title,
      content_md: row.content_md,
      data: JSON.parse(row.data_json),
      created_at: row.created_at,
    }));
  }

  // Embedding queries

  getEmbedding(id: string): EmbeddingData | null {
    const row = this.db
      .prepare("SELECT * FROM embeddings WHERE id = ?")
      .get(id) as EmbeddingRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      owner_type: row.owner_type,
      owner_id: row.owner_id,
      provider: row.provider,
      model: row.model ?? "unknown",
      dims: row.dims,
      vector: JSON.parse(row.vector_json),
      content_hash: row.content_hash,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  getEmbeddingsByOwner(
    owner_type: "artifact" | "entity",
    owner_id: string,
  ): EmbeddingData[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM embeddings WHERE owner_type = ? AND owner_id = ? ORDER BY updated_at DESC",
      )
      .all(owner_type, owner_id) as EmbeddingRow[];
    return rows.map((row) => ({
      id: row.id,
      owner_type: row.owner_type,
      owner_id: row.owner_id,
      provider: row.provider,
      model: row.model ?? "unknown",
      dims: row.dims,
      vector: JSON.parse(row.vector_json),
      content_hash: row.content_hash,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  listEmbeddings(filter: {
    owner_type?: "artifact" | "entity";
    since?: string;
    limit?: number;
  }): EmbeddingData[] {
    let sql = "SELECT * FROM embeddings WHERE 1=1";
    const params: DbParam[] = [];

    if (filter.owner_type) {
      sql += " AND owner_type = ?";
      params.push(filter.owner_type);
    }
    if (filter.since) {
      sql += " AND updated_at > ?";
      params.push(filter.since);
    }
    sql += " ORDER BY updated_at DESC";
    if (filter.limit) {
      sql += " LIMIT ?";
      params.push(filter.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as EmbeddingRow[];
    return rows.map((row) => ({
      id: row.id,
      owner_type: row.owner_type,
      owner_id: row.owner_id,
      provider: row.provider,
      model: row.model ?? "unknown",
      dims: row.dims,
      vector: JSON.parse(row.vector_json),
      content_hash: row.content_hash,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  // Trace event queries

  listTraceEvents(filter: {
    traceId?: string;
    jobId?: string;
    since?: string;
    limit?: number;
  }): TraceEvent[] {
    let sql = "SELECT * FROM trace_events WHERE 1=1";
    const params: DbParam[] = [];

    if (filter.traceId) {
      sql += " AND trace_id = ?";
      params.push(filter.traceId);
    }
    if (filter.jobId) {
      sql += " AND job_id = ?";
      params.push(filter.jobId);
    }
    if (filter.since) {
      sql += " AND created_at > ?";
      params.push(filter.since);
    }
    sql += " ORDER BY created_at ASC";
    const limit = filter.limit ?? 200;
    sql += " LIMIT ?";
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as TraceEventRow[];
    return rows.map((row) => ({
      id: row.id,
      trace_id: row.trace_id,
      job_id: row.job_id,
      workflow_id: row.workflow_id,
      kind: row.kind,
      message: row.message,
      span_id: row.span_id,
      parent_span_id: row.parent_span_id,
      status: row.status,
      started_at: row.started_at,
      ended_at: row.ended_at,
      duration_ms: row.duration_ms,
      data: row.data_json ? JSON.parse(row.data_json) : {},
      created_at: row.created_at,
    }));
  }
}
