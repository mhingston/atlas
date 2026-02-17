-- ISC Reports Table
CREATE TABLE IF NOT EXISTS isc_reports (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  criteria_results JSON NOT NULL,
  anti_criteria_results JSON NOT NULL,
  summary TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
);

-- Reflections Table
CREATE TABLE IF NOT EXISTS reflections (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  effort_level TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  criteria_count INTEGER NOT NULL,
  criteria_passed INTEGER NOT NULL,
  criteria_failed INTEGER NOT NULL,
  within_budget BOOLEAN NOT NULL,
  elapsed_percent REAL NOT NULL,
  implied_sentiment INTEGER,
  q1_self TEXT NOT NULL,
  q2_workflow TEXT NOT NULL,
  q3_system TEXT NOT NULL,
  version TEXT NOT NULL,
  isc_report_id TEXT,
  metadata JSON,
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (isc_report_id) REFERENCES isc_reports(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_isc_reports_artifact ON isc_reports(artifact_id);
CREATE INDEX IF NOT EXISTS idx_isc_reports_type ON isc_reports(artifact_type);
CREATE INDEX IF NOT EXISTS idx_isc_reports_created ON isc_reports(created_at);

CREATE INDEX IF NOT EXISTS idx_reflections_job ON reflections(job_id);
CREATE INDEX IF NOT EXISTS idx_reflections_workflow ON reflections(workflow_id);
CREATE INDEX IF NOT EXISTS idx_reflections_timestamp ON reflections(timestamp);
CREATE INDEX IF NOT EXISTS idx_reflections_type ON reflections(artifact_type);
CREATE INDEX IF NOT EXISTS idx_reflections_isc_report ON reflections(isc_report_id);
