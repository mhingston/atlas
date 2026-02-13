-- Add unique constraint on embeddings to prevent duplicates per owner
-- Migration: 003_embeddings_unique_owner.sql

-- Add unique constraint on (owner_type, owner_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_owner_unique ON embeddings(owner_type, owner_id);

-- Note: This will fail if there are already duplicate rows.
-- If duplicates exist, they should be cleaned up first:
-- DELETE FROM embeddings WHERE id NOT IN (
--   SELECT MIN(id) FROM embeddings GROUP BY owner_type, owner_id
-- );
