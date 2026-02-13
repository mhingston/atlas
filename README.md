# Atlas

**Local, always-on personal AI gateway for durable knowledge work**

Atlas is a single-user, local-first system that ingests data, runs AI-powered
workflows, and produces durable artifacts you can search, curate, and reuse.

**Why Atlas**
- Visible cognition: traceable workflows and explicit checkpoints
- Composable workflows: source → entity → workflow → artifact → workflow
- Judgment amplification: humans stay in control, no autonomous runaway loops
- Durable memory: artifacts + embeddings + weekly synthesis

## Quick Start

```bash
# Install dependencies (already done if you cloned)
bun install

# Start the gateway
bun run dev
```

The server starts on `http://localhost:3000` using the **mock LLM provider** by
default (no API keys required).

## Core Concepts

- **Artifacts**: durable outputs created by workflows
- **Entities/Events**: source-ingested records + change history
- **Workflows**: AI or deterministic jobs that generate artifacts
- **Routing**: profile-based LLM selection with fallbacks

## Common Workflows

- Brainstorming: `brainstorm.v1`
- Scratchpad synthesis: `scratchpad.v1`
- Weekly digest: `digest.weekly.v1`
- Curation (promote/merge/tag/dedupe/reconcile): `curate.artifacts.v1`
- Heartbeat (periodic check-in): `heartbeat.v1`
- Skills inventory: `skills.inventory.v1`

Full workflow docs and examples: `docs/`

## Configuration

### Environment Variables (common)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `ATLAS_DB_PATH` | SQLite database path | `data/atlas.db` |
| `ATLAS_LLM_PROVIDER` | LLM provider preset or `custom` | `mock` |
| `ATLAS_LLM_PROVIDER_FALLBACK` | Fallback when provider unavailable | `error` |
| `ATLAS_HARNESS_ENABLED` | Enable harness runtime | `false` |
| `ATLAS_REQUIRE_APPROVAL_BY_DEFAULT` | Require approval for all workflows unless they explicitly succeed/fail | `false` |
| `ATLAS_MEMORY_PATHS` | Comma-separated memory file paths | `MEMORY.md,memory` |

Full reference: `docs/configuration.md`

### LLM Providers

Atlas supports **any Vercel AI SDK provider**. Install only the provider you
need, then set `ATLAS_LLM_PROVIDER`.

Examples:

```bash
# Mock (default)
ATLAS_LLM_PROVIDER=mock bun run dev

# OpenAI
bun add @ai-sdk/openai
export ATLAS_LLM_PROVIDER=openai
export OPENAI_API_KEY=sk-...
bun run dev

# Custom (any AI SDK provider)
bun add @ai-sdk/google
export ATLAS_LLM_PROVIDER=custom
export ATLAS_LLM_PACKAGE=@ai-sdk/google
export ATLAS_LLM_FACTORY=createGoogleGenerativeAI
export ATLAS_LLM_MODEL=gemini-pro
bun run dev
```

Routing profiles and custom provider selection:
`docs/provider-routing.md`

## API Quick Examples

```bash
# Health
curl http://localhost:3000/health

# Sync sources
curl -X POST http://localhost:3000/sync

# Create a job
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"workflow_id":"brainstorm.v1","input":{"topic":"productivity"}}'
```

Full API examples: `docs/api-examples.md` and `docs/curation.md`

## Architecture Snapshot

```
Sources → Entities/Events → Workflows → Artifacts → Other Workflows → Sinks
```

Versioning overview: `docs/VERSIONING.md`

## Docs

- `docs/README.md`
- `docs/configuration.md`
- `docs/ai-integration.md`
- `docs/provider-routing.md`
- `docs/curation.md`
- `docs/api-examples.md`
- `docs/publishing.md`
- `docs/alignment-checklist.md`

## License

Private project
