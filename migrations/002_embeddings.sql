-- Embeddings table for semantic search (Second Brain)
-- MVP: App-level cosine similarity (no vector DB required)

CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,  -- "artifact" | "entity"
  owner_id TEXT NOT NULL,
  provider TEXT,             -- which backend produced it (e.g., "openai")
  model TEXT,                -- model identifier (e.g., "text-embedding-3-small")
  dims INTEGER,              -- dimensionality of the vector
  vector_json TEXT NOT NULL, -- array of floats as JSON string
  content_hash TEXT,         -- hash of source content for change detection
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Index for looking up embeddings by owner
CREATE INDEX IF NOT EXISTS idx_embeddings_owner ON embeddings(owner_type, owner_id);

-- Index for finding recently updated embeddings
CREATE INDEX IF NOT EXISTS idx_embeddings_updated ON embeddings(updated_at);

-- Index for finding embeddings by content hash (for duplicate detection)
CREATE INDEX IF NOT EXISTS idx_embeddings_hash ON embeddings(content_hash);
