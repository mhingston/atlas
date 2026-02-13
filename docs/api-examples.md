# API Examples

## Health
```bash
curl http://localhost:3000/health
```

## Sync Sources
```bash
# Sync all sources
curl -X POST http://localhost:3000/sync

# Sync specific sources
curl -X POST http://localhost:3000/sync \
  -H "Content-Type: application/json" \
  -d '{"sources":["mock.source"]}'
```

## Create Jobs

### Brainstorm Workflow
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "brainstorm.v1",
    "input": {
      "topic": "productivity",
      "constraints": ["focus on automation", "consider AI tools"]
    }
  }'
```

### Scratchpad Workflow (ideation / synthesis)
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "scratchpad.v1",
    "input": {
      "topic": "AI tooling alignment",
      "intent": "synthesis",
      "constraints": ["be explicit about gaps", "cite context"],
      "owner_type": "artifact",
      "since": "2026-01-01T00:00:00.000Z",
      "k": 8
    }
  }'
```

### Scratchpad Review Workflow (decision note + approval)
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "scratchpad.review.v1",
    "input": {
      "topic": "AI tooling alignment",
      "intent": "synthesis",
      "constraints": ["be explicit about gaps", "cite context"],
      "owner_type": "artifact",
      "since": "2026-01-01T00:00:00.000Z",
      "k": 8
    }
  }'
```

### Heartbeat Workflow (periodic check-in)
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "heartbeat.v1",
    "input": {
      "heartbeat_path": "HEARTBEAT.md",
      "indexEmbeddings": true
    }
  }'
```

### Skills Inventory Workflow
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "skills.inventory.v1",
    "input": { "indexEmbeddings": true }
  }'
```

### Curation Workflow (promote / merge / tag)
```bash
# Promote multiple artifacts into a canonical note
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "curate.artifacts.v1",
    "input": {
      "action": "promote",
      "sourceIds": ["art_1", "art_2"],
      "title": "Canonical Note: AI Tooling",
      "tags": ["ai", "tools"]
    }
  }'

# Merge into a canonical note
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "curate.artifacts.v1",
    "input": {
      "action": "merge",
      "targetId": "art_1",
      "sourceIds": ["art_2", "art_3"]
    }
  }'

# Tag existing artifacts
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "curate.artifacts.v1",
    "input": {
      "action": "tag",
      "sourceIds": ["art_1", "art_2"],
      "tags": ["reviewed", "canonical"]
    }
  }'
```

### Curation Workflow (dedupe / reconcile)
```bash
# Dedupe candidates by title/content heuristics
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "curate.artifacts.v1",
    "input": {
      "action": "dedupe",
      "typeFilter": "note.v1",
      "limit": 50,
      "maxGroups": 10
    }
  }'

# Dedupe by embeddings (semantic similarity)
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "curate.artifacts.v1",
    "input": {
      "action": "dedupe",
      "dedupeMode": "embedding",
      "similarityThreshold": 0.85,
      "suggestMerge": true,
      "minGroupSize": 2,
      "limit": 100,
      "dedupeWindowSize": 200,
      "dedupeWindowOverlap": 50,
      "maxGroups": 20
    }
  }'

# Reconcile conflicts across sources
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "curate.artifacts.v1",
    "input": {
      "action": "reconcile",
      "sourceIds": ["art_1", "art_2"],
      "title": "Reconciled Note",
      "reconcilePolicy": {
        "prefer": "source",
        "sourcePriority": ["trusted.manual.notes", "raindrop.bookmark"],
        "requireCitations": true
      }
    }
  }'
```

### Apply Merge Suggestion (explicit approval)
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "curate.merge.apply.v1",
    "input": {
      "sourceIds": ["art_1", "art_2"],
      "title": "Merged Note",
      "supersede": true
    }
  }'
```

### Apply Reconcile Suggestion (explicit approval)
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "curate.reconcile.apply.v1",
    "input": {
      "reconcileArtifactId": "art_reconcile_123",
      "title": "Reconciled Canonical Note",
      "supersede": true
    }
  }'
```

### Code Assist Workflow (requires harness)
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "code.assist.v1",
    "input": {
      "goal": "Add error handling to API routes",
      "repoPath": "/path/to/repo",
      "mode": "propose"
    }
  }'
```

### Code Review Workflow (explicit checkpoint)
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "code.review.v1",
    "input": {
      "goal": "Refactor job runner logging",
      "repoPath": "/path/to/repo",
      "mode": "propose",
      "requireApproval": true
    }
  }'
```

### Code Pipeline Workflow (assist → review)
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "code.pipeline.v1",
    "input": {
      "goal": "Tighten DB error handling",
      "repoPath": "/path/to/repo",
      "mode": "propose",
      "requireApproval": true
    }
  }'
```

### Weekly Digest Workflow (semantic synthesis)
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "digest.weekly.v1",
    "input": {
      "query": "AI tooling ideas",
      "since": "2026-01-26T00:00:00.000Z",
      "k": 10
    }
  }'
```

## Scheduling Workflows (cron)

Atlas does not run internal workflow schedules. For single-user setups, use cron
to call the CLI or HTTP API.

```bash
# Weekly digest via CLI
0 9 * * 1 ATLAS_URL=http://localhost:3000 atlas jobs create digest.weekly.v1 \
  --input='{"query":"AI tooling ideas","owner_type":"artifact","k":10,"limit":200}'
```

## Jobs, Artifacts, and Ops

```bash
# Get job status
curl http://localhost:3000/jobs/{job_id}

# Trace events (JSON)
curl http://localhost:3000/jobs/{job_id}/trace

# HTML timeline view
open http://localhost:3000/jobs/{job_id}/timeline

# Ops view (approvals + recent jobs)
open http://localhost:3000/ops
```

## Approval APIs

```bash
# Approve a job that is waiting on explicit review
curl -X POST http://localhost:3000/jobs/{job_id}/approve

# Deny a job and mark it failed
curl -X POST http://localhost:3000/jobs/{job_id}/deny

# Approval timeline view
open http://localhost:3000/approvals

# Approval timeline (JSON + filters)
curl "http://localhost:3000/approvals.json?status=needs_approval&workflow_id=code.review.v1&limit=50"
curl "http://localhost:3000/approvals.json?status=needs_approval&limit=20&cursor=job_01HXYZ..."
```

## Artifacts and Search

```bash
# List artifacts
curl http://localhost:3000/artifacts
curl "http://localhost:3000/artifacts?type=brainstorm.session.v1"
curl "http://localhost:3000/artifacts?job_id=job_..."

# Get artifact
curl http://localhost:3000/artifacts/{artifact_id}

# Skills registry
curl http://localhost:3000/skills
curl http://localhost:3000/skills/{skill_name}

# Semantic search (embeddings)
curl "http://localhost:3000/search?q=AI%20tooling&k=10&type=artifact&since=2026-01-01T00:00:00.000Z"
```

## Maintenance

```bash
# Prune old data based on policy
curl -X POST http://localhost:3000/maintenance/prune \
  -H "Content-Type: application/json" \
  -d '{
    "policy": {
      "delivered_domain_events_days": 7,
      "jobs_days": 30,
      "artifacts_days": 90,
      "events_days": 60,
      "traces_days": 30
    }
  }'
```
