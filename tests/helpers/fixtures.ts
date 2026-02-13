import { Database } from "bun:sqlite";
import { ulid } from "ulid";
import type {
  Artifact,
  DomainEvent,
  Entity,
  Event,
  Job,
} from "../../src/core/types";

/**
 * Test utilities and fixtures for Atlas testing
 */

/**
 * Create an in-memory test database
 */
export function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}

/**
 * Run migrations on test database
 */
export function runTestMigrations(db: Database) {
  // Match production schema from migrations/001_init.sql
  const migrations = [
    `
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      title TEXT,
      url TEXT,
      status TEXT,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
    CREATE INDEX IF NOT EXISTS idx_entities_source ON entities(source);
    `,
    `
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      type TEXT NOT NULL,
      actor TEXT,
      created_at TEXT NOT NULL,
      body TEXT,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity_id);
    `,
    `
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      input_json TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      log_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    `,
    `
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      job_id TEXT,
      title TEXT,
      content_md TEXT,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
    CREATE INDEX IF NOT EXISTS idx_artifacts_job ON artifacts(job_id);
    `,
    `
    CREATE TABLE IF NOT EXISTS domain_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      aggregate_id TEXT,
      payload_json TEXT NOT NULL,
      delivered INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_domain_events_delivered ON domain_events(delivered, created_at);
    `,
    `
    CREATE TABLE IF NOT EXISTS embeddings (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      dims INTEGER,
      vector_json TEXT NOT NULL,
      content_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_embeddings_owner ON embeddings(owner_type, owner_id);
    CREATE INDEX IF NOT EXISTS idx_embeddings_updated ON embeddings(updated_at);
    CREATE INDEX IF NOT EXISTS idx_embeddings_hash ON embeddings(content_hash);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_owner_unique ON embeddings(owner_type, owner_id);
    `,
    `
    CREATE TABLE IF NOT EXISTS trace_events (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      job_id TEXT,
      workflow_id TEXT,
      kind TEXT NOT NULL,
      message TEXT,
      span_id TEXT,
      parent_span_id TEXT,
      status TEXT,
      started_at TEXT,
      ended_at TEXT,
      duration_ms INTEGER,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trace_events_trace_id ON trace_events(trace_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_trace_events_job_id ON trace_events(job_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_trace_events_kind ON trace_events(kind, created_at);
    `,
  ];

  for (const sql of migrations) {
    db.exec(sql);
  }
}

/**
 * Test data factories
 */
export const fixtures = {
  entity: (overrides?: Partial<Entity>): Entity => ({
    id: `ent_${ulid()}`,
    type: "test.entity",
    source: "test.source",
    title: "Test Entity",
    url: "https://example.com",
    status: "active",
    updated_at: new Date().toISOString(),
    data: {},
    ...overrides,
  }),

  event: (entityId: string, overrides?: Partial<Event>): Event => ({
    id: `evt_${ulid()}`,
    entity_id: entityId,
    type: "test.event",
    actor: "test",
    created_at: new Date().toISOString(),
    body: "Test event",
    data: {},
    ...overrides,
  }),

  job: (overrides?: Partial<Job>): Job => ({
    id: `job_${ulid()}`,
    workflow_id: "test.workflow.v1",
    status: "queued",
    input: {},
    started_at: null,
    finished_at: null,
    log: null,
    ...overrides,
  }),

  artifact: (overrides?: Partial<Artifact>): Artifact => ({
    id: `art_${ulid()}`,
    type: "test.artifact.v1",
    job_id: null,
    title: "Test Artifact",
    content_md: "# Test Content",
    data: {},
    created_at: new Date().toISOString(),
    ...overrides,
  }),

  domainEvent: (overrides?: Partial<DomainEvent>): DomainEvent => ({
    id: `dom_${ulid()}`,
    type: "test.event",
    created_at: new Date().toISOString(),
    aggregate_id: null,
    payload: {},
    ...overrides,
  }),
};

/**
 * Helper to insert test data directly into DB
 */
export const dbHelpers = {
  insertEntity: (db: Database, entity: Entity) => {
    db.prepare(`
      INSERT INTO entities (id, type, source, title, url, status, updated_at, data_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entity.id,
      entity.type,
      entity.source,
      entity.title,
      entity.url,
      entity.status,
      entity.updated_at,
      JSON.stringify(entity.data),
    );
  },

  insertJob: (db: Database, job: Job) => {
    db.prepare(`
      INSERT INTO jobs (id, workflow_id, status, input_json, started_at, finished_at, log_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.id,
      job.workflow_id,
      job.status,
      JSON.stringify(job.input),
      job.started_at,
      job.finished_at,
      job.log ? JSON.stringify(job.log) : null,
    );
  },

  insertArtifact: (db: Database, artifact: Artifact) => {
    db.prepare(`
      INSERT INTO artifacts (id, type, job_id, title, content_md, data_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      artifact.id,
      artifact.type,
      artifact.job_id,
      artifact.title,
      artifact.content_md,
      JSON.stringify(artifact.data),
      artifact.created_at,
    );
  },
};

/**
 * Mock LLM provider for testing
 */
export const mockLLM = {
  async generateText(prompt: string) {
    return {
      text: `Mock response to: ${prompt.substring(0, 50)}...`,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    };
  },

  async streamText(_prompt: string) {
    const chunks = ["Mock ", "streamed ", "response"];
    return {
      async *textStream() {
        for (const chunk of chunks) {
          yield chunk;
        }
      },
    };
  },
};
