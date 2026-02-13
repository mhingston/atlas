-- 004_trace_events.sql
PRAGMA journal_mode = WAL;

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
