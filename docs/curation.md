# Curation Workflows

This document covers curation workflows and the scaling/policy controls for dedupe and reconciliation.

## Dedupe (curate.artifacts.v1)

Inputs (dedupe action):

- `dedupeMode`: `title` or `embedding`
- `similarityThreshold`: float, default `0.9`
- `minGroupSize`: integer, default `2`
- `maxCandidates`: max artifacts to consider (default `500`)
- `maxGroups`: cap on returned groups (default `20`)
- `dedupeBatchSize`: batch size for paging through large candidate sets
- `dedupeCursor`: artifact ID to resume from (exclusive)
- `dedupeWindowSize`: window size for embedding grouping (default `200`)
- `dedupeWindowOverlap`: overlap between windows (default `50`)
- `emitGroupArtifacts`: emit `curation.dedupe.group.v1` artifacts (default `true`)

Notes:
- Embedding mode uses a windowed grouping pass to scale to larger candidate sets.
- Groups above `maxGroups` are dropped and recorded in the summary artifact data.
- When `dedupeCursor` is provided, candidates are loaded **before** the cursor artifact's timestamp.

Example (paged dedupe):

```json
{
  "workflow_id": "curate.artifacts.v1",
  "input": {
    "action": "dedupe",
    "dedupeMode": "embedding",
    "dedupeBatchSize": 200,
    "dedupeCursor": "art_01HX..."
  }
}
```

## Reconcile (curate.artifacts.v1)

Inputs (reconcile action):

- `reconcilePolicy`: policy object guiding conflict resolution
  - `prefer`: `latest` | `earliest` | `longest` | `shortest` | `source`
  - `sourcePriority`: ordered array of source IDs (highest priority first)
  - `requireCitations`: boolean
  - `allowUnresolved`: boolean

The reconcile prompt includes a Decision Log table to make conflict handling explicit.

Reconcile emits an approval checkpoint that recommends running `curate.reconcile.apply.v1` with the produced reconcile artifact.

## Apply Reconcile (curate.reconcile.apply.v1)

Use this workflow to convert a reconciled artifact into a canonical note after approval.

Inputs:
- `reconcileArtifactId` (required): ID of a `curation.reconcile.v1` artifact
- `title`: canonical note title (defaults to reconcile artifact title)
- `noteType`: canonical note type (defaults to `note.canonical.v1`)
- `supersede`: emit a `curation.supersedes.v1` artifact
- `indexEmbeddings`: re-index embeddings (default true)
