# Atlas

**Local, always-on personal AI assistant gateway**

Atlas is a single-user, local-first, plugin-based system that ingests data from many sources, runs AI-powered workflows, and produces durable artifacts.

Positioning: Atlas favors visible cognition, composable workflows, and judgment amplification. It is not an autonomous “set-and-forget” agent; it is a local-first gateway that compresses time-to-outcome while keeping humans in control.

## Quick Start

```bash
# Install dependencies (already done if you cloned)
bun install

# Start the gateway
bun run dev
```

The server will start on `http://localhost:3000` using the **mock LLM provider** by default (no API keys required).

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `ATLAS_DB_PATH` | SQLite database path | `data/atlas.db` |
| `ATLAS_LLM_PROVIDER` | LLM provider preset or `custom` | `mock` |
| `ATLAS_LLM_PROVIDER_FALLBACK` | Fallback when provider unavailable | `error` |
| `ATLAS_HARNESS_ENABLED` | Enable harness runtime | `false` |
| `ATLAS_REQUIRE_APPROVAL_BY_DEFAULT` | Require approval for all workflows unless they explicitly succeed/fail | `false` |
| `ATLAS_MEMORY_PATHS` | Comma-separated memory file paths | `MEMORY.md,memory` |

For the full environment variable reference (routing, skills, embeddings) and
scheduling guidance, see the [Configuration Guide](./docs/configuration.md).

### LLM Providers

Atlas supports **any Vercel AI SDK provider**. Provider-specific SDK packages are **optional** — install only what you need.

#### Mock (default - no installation required)
```bash
# Uses placeholder responses for testing
ATLAS_LLM_PROVIDER=mock bun run dev
```

#### OpenAI
```bash
# Install OpenAI SDK
bun add @ai-sdk/openai

# Configure and run
export ATLAS_LLM_PROVIDER=openai
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini  # optional
bun run dev
```

#### Anthropic
```bash
# Install Anthropic SDK
bun add @ai-sdk/anthropic

# Configure and run
export ATLAS_LLM_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-...
export ANTHROPIC_MODEL=claude-3-5-sonnet-20241022  # optional
bun run dev
```

#### Ollama (local - no API key required)
```bash
# Install Ollama provider
bun add ollama-ai-provider

# Configure and run
export ATLAS_LLM_PROVIDER=ollama
export OLLAMA_BASE_URL=http://localhost:11434  # optional
export OLLAMA_MODEL=llama3.2  # optional
bun run dev
```

#### Any AI SDK Provider
```bash
# Example: Google Gemini
bun add @ai-sdk/google

export ATLAS_LLM_PROVIDER=custom
export ATLAS_LLM_PACKAGE=@ai-sdk/google
export ATLAS_LLM_FACTORY=createGoogleGenerativeAI
export ATLAS_LLM_MODEL=gemini-pro
export GOOGLE_GENERATIVE_AI_API_KEY=...
bun run dev
```

### Harness Runtime (Code Assistance)

Atlas supports optional "harness" runtimes for agent-driven code tasks (like Codex CLI, OpenCode, Aider, etc.).

Harnesses are **config-driven** - define them in `gateway.routing.json`:

```json
{
  "harnesses": {
    "codex-cli": {
      "command": "copilot",
      "args_template": ["--goal", "{goal}", "--cwd", "{cwd}"],
      "output_parsers": {
        "text": { "type": "stdout_all" }
      },
      "timeout_ms": 300000
    }
  }
}
```

Enable harness runtime:

```bash
export ATLAS_HARNESS_ENABLED=true
bun run dev
```

**Note:** Harness features require additional policy capabilities for command execution and file access. See [Provider Routing Guide](./docs/provider-routing.md) for complete configuration details.

For complete configuration options, see:
- [Configuration Guide](./docs/configuration.md)
- [AI Integration Guide](./docs/ai-integration.md)
- [Curation Guide](./docs/curation.md)
- [Publishing Guide](./docs/publishing.md)

## API Endpoints

### Health Check
```bash
curl http://localhost:3000/health
```

### Sync Sources
```bash
# Sync all sources
curl -X POST http://localhost:3000/sync

# Sync specific sources
curl -X POST http://localhost:3000/sync \
  -H "Content-Type: application/json" \
  -d '{"sources":["mock.source"]}'
```

### Create Job

#### Brainstorm Workflow
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

#### Scratchpad Workflow (ideation / synthesis)
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

#### Scratchpad Review Workflow (decision note + approval)
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

#### Heartbeat Workflow (periodic check-in)
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

#### Skills Inventory Workflow
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "skills.inventory.v1",
    "input": { "indexEmbeddings": true }
  }'
```

#### Curation Workflow (promote / merge / tag)
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

#### Curation Workflow (dedupe / reconcile)
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

For structured reconciliation with conflict resolution, use `curate.reconcile.v2` (see [Curation Guide](./docs/curation.md)).

#### Apply Merge Suggestion (explicit approval)
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

#### Apply Reconcile Suggestion (explicit approval)
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

#### Code Assist Workflow (requires harness)
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

#### Code Review Workflow (explicit checkpoint)
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

#### Code Pipeline Workflow (assist → review)
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

#### Weekly Digest Workflow (semantic synthesis)
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

#### Scheduling Workflows (cron)
Atlas does not run internal workflow schedules. For single-user setups, use cron
to call the CLI or HTTP API.

```bash
# Weekly digest via CLI
0 9 * * 1 ATLAS_URL=http://localhost:3000 atlas jobs create digest.weekly.v1 \
  --input='{"query":"AI tooling ideas","owner_type":"artifact","k":10,"limit":200}'
```

### Get Job Status
```bash
curl http://localhost:3000/jobs/{job_id}
```

### Trace Events (Reasoning Timeline)
```bash
# JSON trace for a job
curl http://localhost:3000/jobs/{job_id}/trace

# HTML timeline view
open http://localhost:3000/jobs/{job_id}/timeline
```

### Ops View (Approvals + Recent Jobs)
```bash
open http://localhost:3000/ops
```

### Approve or Deny a Checkpoint
```bash
# Approve a job that is waiting on explicit review
curl -X POST http://localhost:3000/jobs/{job_id}/approve

# Deny a job and mark it failed
curl -X POST http://localhost:3000/jobs/{job_id}/deny
```

### Approval Timeline View
```bash
open http://localhost:3000/approvals
```

### Approval Timeline (JSON + Filters)
```bash
# Filter by status/workflow and paginate
curl "http://localhost:3000/approvals.json?status=needs_approval&workflow_id=code.review.v1&limit=50"

# Use cursor-based pagination
curl "http://localhost:3000/approvals.json?status=needs_approval&limit=20&cursor=job_01HXYZ..."
```

### List Artifacts
```bash
# All artifacts
curl http://localhost:3000/artifacts

# Filter by type
curl "http://localhost:3000/artifacts?type=brainstorm.session.v1"

# Filter by job
curl "http://localhost:3000/artifacts?job_id=job_..."
```

### Get Artifact
```bash
curl http://localhost:3000/artifacts/{artifact_id}
```

### Skills Registry
```bash
# List skills
curl http://localhost:3000/skills

# Fetch a skill
curl http://localhost:3000/skills/{skill_name}
```

### Semantic Search (Embeddings)
```bash
curl "http://localhost:3000/search?q=AI%20tooling&k=10&type=artifact&since=2026-01-01T00:00:00.000Z"
```

### Maintenance Operations
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

## Testing

### Running Tests
```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Watch mode during development
bun test --watch
```

### Test Coverage
Coverage reports are available via `bun test --coverage`.

## Architecture

### System Overview

Atlas is a pluggable core runtime: the core depends on the SDK, and external plugins depend on the SDK.

```
Core (HTTP, jobs, DB, LLM, registry)
  ↓ uses
@mhingston5/atlas-plugin-sdk (types + manifest validation, API v1.0)
  ↓ used by
External plugins (npm/GitHub/local/URL)
```

**Versioning snapshot**
- Core: SemVer (`package.json`)
- SDK: SemVer (`plugin-sdk/package.json`)
- API: X.Y contract (`plugin-sdk/src/types.ts`)
- Plugin: SemVer (`atlas.plugin.json`)
- Compatibility: API major must match; plugin minor <= core minor

### Core Concepts

- **Single-writer model**: All database mutations go through a command queue → flush loop → writer
- **Plugin-based**: Extensible via source, workflow, and sink plugins
- **Artifact-driven**: Workflows produce artifacts that other workflows can consume
- **SQLite WAL**: Local-first persistence with Write-Ahead Logging

### Plugin System Status

- ✅ SDK package in `plugin-sdk/` (types, manifest validation, helpers)
- ✅ External loader supports npm/GitHub/local/URL sources with API checks + lifecycle
- ✅ Example filesystem source plugin in `examples/filesystem-source-plugin/`
- ⚠️ Gaps: SDK not published to npm, no registry, no sandbox
- Next: publish SDK, update example dependency, validate GitHub loading

## AI Tooling Alignment (January 2026)

Atlas is intentionally aligned with the “TRY” bucket in the January 2026 summary:

- **Personal agent loops with explicit control**  
  Harness-based workflows (`code.assist.v1`, `code.review.v1`, `code.pipeline.v1`) default to *propose* mode and can require explicit approval checkpoints before a job is marked complete.

- **Local / hybrid LLM setups**  
  Routing supports local Ollama and remote providers with profile-based fallback (`fast` / `balanced` / `quality`), so you can keep cheap/local reasoning on most steps and only use frontier models when needed.

- **Code-first automation**  
  Workflows are code, not UI wrappers. Harnesses are config-driven and policy-gated, making automation composable and inspectable.

- **Persistent second brain**  
  Artifacts + embeddings + weekly digest provide long-lived, queryable memory with synthesis on top.

### Deeper Mapping (Summary → Atlas)

| Summary Item | Atlas Mapping | Status |
|---|---|---|
| Personal agent loops with explicit control | Harness workflows + approval checkpoints (`code.review.v1`, `code.pipeline.v1`) + verifier hook in runner | Strong |
| Local/hybrid LLM setups | Ollama + remote providers via profile routing + fallback chain | Strong |
| Code-first automation | Workflow plugins + config-driven harnesses + policy gating | Strong |
| Persistent second brain | Artifacts + embeddings indexing + weekly digest + search endpoint | Strong |
| Fully autonomous agents | Not a goal; harness is gated and defaults to *propose* | Intentional non-goal |
| Multimodal “do everything” models | Not integrated (no vision/audio pipeline yet) | Not planned |
| AI-native productivity suites | Not a goal; Atlas is infra, not a suite | Intentional non-goal |
| Opaque/monolithic agents | Avoided by design (routing + explicit capabilities) | Avoided |

### Alignment Gaps (and how to close them)

- **Explicit checkpoints as a default**: Set `ATLAS_REQUIRE_APPROVAL_BY_DEFAULT=true` to force approval unless a workflow explicitly succeeds/fails.  
- **Curation loops**: `curate.artifacts.v1` supports promote/merge/tag/dedupe/reconcile; `curate.reconcile.v2` adds structured reconciliation. Scale + UX tuning remain open.  
- **Thinking loop UX**: Scratchpad workflows exist; expand fast-start UX and decision checkpoints.  
- **Operator ergonomics**: Ops and approvals views exist; CLI affordances remain open.  
- **Visibility of cognition**: Trace events are emitted for job/workflow/LLM/harness steps, with `/jobs/:id/trace` and `/jobs/:id/timeline` for inspection.

If you want, we can prioritize these as next steps (new workflows + lightweight views).

### Alignment Checklist

See `docs/alignment-checklist.md` for a short, operator-focused checklist to validate Atlas against the January 2026 positioning.

## Use Cases

Atlas is designed for **personal knowledge work automation**. Common workflows include:

**Knowledge Management**
- **Semantic search** across bookmarks, notes, and documents using embeddings
- **Weekly digests** that synthesize recent content with AI insights  
- **Content curation** - auto-organize, tag, and surface relevant artifacts
- **Scratchpad sessions** for structured ideation and synthesis

**Content Creation**
- **Brainstorming** with context from your existing knowledge base
- **Writing assistance** that references your curated materials
- **Document synthesis** from multiple sources

**Code & Development**
- **Code reviews** with AI analysis
- **Automated refactoring** via the harness system (safe "propose" mode by default)
- **Development pipelines** that combine assistance + review

**Research & Learning**
- **Topic exploration** - query your knowledge graph for connections
- **Research synthesis** - identify patterns across accumulated content
- **Reference management** - automatically cite sources from your database

### Data Flow

```
Sources → Entities/Events → Workflows → Artifacts → Other Workflows → Sinks
```

### Included Plugins

| Type | ID | Description |
|------|----|-----------| 
| Workflow | `brainstorm.v1` | AI-powered brainstorming session generator |
| Workflow | `code.assist.v1` | Harness-driven code task assistance |
| Workflow | `code.pipeline.v1` | Harness assist plus review in a single pipeline |
| Workflow | `code.review.v1` | Harness + LLM review with explicit approval checkpoint |
| Workflow | `curate.artifacts.v1` | Promote/merge/tag artifacts for long-lived memory |
| Workflow | `curate.merge.apply.v1` | Apply an approved merge suggestion |
| Workflow | `curate.reconcile.v2` | Reconcile artifacts with structured conflict resolution |
| Workflow | `digest.daily.v1` | Deterministic daily digest (no LLM) |
| Workflow | `digest.weekly.v1` | Embedding-based weekly synthesis across artifacts |
| Workflow | `index.embeddings.v1` | Index artifacts/entities for semantic search |
| Workflow | `scratchpad.v1` | Structured scratchpad for ideation and synthesis |
| Workflow | `scratchpad.review.v1` | Scratchpad plus decision note with approval checkpoint |
| Workflow | `heartbeat.v1` | Periodic heartbeat check-in from HEARTBEAT.md |
| Workflow | `skills.inventory.v1` | Inventory skills into a single artifact |
| Workflow | `curate.reconcile.apply.v1` | Apply an approved reconcile suggestion |
| Source | `mock.source` | Creates test bookmark entities |
| Source | `memory.source` | Indexes MEMORY.md + memory/*.md as entities |
| Sink | `log.sink` | Logs domain events to console |

## Development

### Project Structure

```
atlas/
├── src/
│   ├── core/       # DB, types, commands, writer
│   ├── plugins/    # Registry, workflows, sources, sinks
│   ├── jobs/       # Runner, scheduler, flush loop
│   ├── api/        # HTTP server
│   ├── ai/         # LLM provider abstraction
│   └── index.ts    # Entry point
├── migrations/     # SQL schema migrations
├── tests/          # Test files
└── data/           # SQLite database
```

### Adding a New Workflow

1. Create a file in `src/plugins/workflows/`
2. Implement the `WorkflowPlugin` interface
3. Register it in `src/index.ts`

Example:

```typescript
import type { WorkflowPlugin } from "../types";

export const myWorkflow: WorkflowPlugin = {
  id: "my-workflow.v1",
  async run(ctx, input, jobId) {
    // Use ctx.llm.generateText() for AI calls
    // Use ctx.emitArtifact() to create artifacts
    // Use ctx.repo to query entities/artifacts
  }
};
```

## License

Private project
