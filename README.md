# Atlas

**Local-first personal AI gateway with built-in quality verification**

Atlas transforms AI from a black box into a systematic quality system. It runs
AI-powered workflows that produce **verified artifacts**—not just outputs, but
durable, traceable work products you can trust, search, and build upon.

[![Tests](https://img.shields.io/badge/tests-261%20passing-brightgreen)]()
[![Version](https://img.shields.io/badge/version-1.1.0-blue)]()

**Why Atlas**
- **Quality-first**: Every artifact is verified against explicit, testable quality criteria
- **Traceable**: Full provenance from sources → workflows → artifacts
- **Self-improving**: Systematic reflection and learning from every execution
- **Local & Private**: Your data stays on your machine
- **Composable**: Workflows chain together: source → entity → workflow → artifact → workflow

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

- **Artifacts**: Durable outputs with automatic quality verification
- **Entities/Events**: Source-ingested records with full change history
- **Workflows**: AI or deterministic jobs that generate verified artifacts
- **Routing**: Profile-based LLM selection with fallbacks and effort-based budgets
- **Ideal State Criteria**: Explicit, testable quality criteria for every artifact
- **Reflection**: Auto-generated learning from every workflow execution

## Common Workflows

- Brainstorming: `brainstorm.v1`
- Scratchpad synthesis: `scratchpad.v1`
- Weekly digest: `digest.weekly.v1`
- Curation (promote/merge/tag/dedupe/reconcile): `curate.artifacts.v1`
- Heartbeat (periodic check-in): `heartbeat.v1`
- Skills inventory: `skills.inventory.v1`

Full workflow docs and examples: [docs](./docs/README.md)

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

Full reference: [Configuration Guide](./docs/configuration.md)

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
[Provider Routing Guide](./docs/provider-routing.md)

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

### OpenAI-Compatible API

Atlas provides an OpenAI-compatible chat completions API for interacting with workflows:

```bash
# List available models
curl http://localhost:3000/v1/models

# Chat with Atlas
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "atlas-scratchpad",
    "messages": [{"role": "user", "content": "What should I focus on?"}]
  }'

# Or use with OpenAI SDK
# base_url: http://localhost:3000/v1
```

Full API docs: [OpenAI-Compatible API](./docs/openai-api.md)

Full API examples: [API Examples](./docs/api-examples.md) and [Curation Guide](./docs/curation.md)

## Architecture Snapshot

```
Sources → Entities/Events → Workflows → Artifacts → Other Workflows → Sinks
```

Versioning overview: [Versioning Guide](./docs/VERSIONING.md)

## Quality Features

Atlas includes systematic quality management through Ideal State Criteria—a
methodology for defining and verifying what "good" means for every artifact.

### How It Works

1. **Define Criteria**: Each artifact type has explicit quality criteria (e.g., "Summaries must have 3-5 key points")
2. **Automatic Verification**: Artifacts are verified before emission using CLI, Grep, or Custom verifiers
3. **Fail-Closed**: CRITICAL failures block artifact emission until fixed
4. **Learn**: Systematic Q1/Q2/Q3 reflection improves future executions

### Effort-Based Quality

Control quality by choosing effort level:

| Level | Budget | Quality | Use Case |
|-------|--------|---------|----------|
| INSTANT | <10s | Basic | Quick answers |
| FAST | <1min | Standard | Simple tasks |
| STANDARD | <2min | High (default) | Daily work |
| EXTENDED | <8min | Very High | Important docs |
| COMPREHENSIVE | <120min | Maximum | Deep investigations |

```json
// gateway.routing.json
{
  "profiles": {
    "balanced": {
      "effortLevel": "STANDARD",
      "providers": ["openai"],
      "models": ["gpt-4o"]
    }
  }
}
```

### Example: Verified Summaries

```typescript
// Summary criteria ensure quality
export const summaryCriteria = {
  artifactType: "summary.note.v1",
  idealCriteria: [
    { id: "CRITERIA-SUM-001", criterion: "Captures 3-5 key points",
      priority: "CRITICAL", verify: { type: "CUSTOM", description: "Count key points" } },
    { id: "CRITERIA-SUM-002", criterion: "Has source attributions",
      priority: "CRITICAL", verify: { type: "GREP", pattern: "\\[.*?\\]" } },
    { id: "CRITERIA-SUM-003", criterion: "100-300 words",
      priority: "IMPORTANT", verify: { type: "CLI", command: "wc -w" } }
  ],
  antiCriteria: [
    { id: "ANTI-CRITERIA-SUM-001", criterion: "No hallucinated facts",
      priority: "CRITICAL", verify: { type: "CUSTOM", description: "Cross-reference sources" } }
  ]
};
```

Results: Summaries that **provably** meet criteria, not just "look good."

### Persistent Requirement Documents

Every artifact gets a requirement document stored as markdown with YAML frontmatter:
- **Intent**: What problem this solves
- **Constraints**: What must be true
- **Decisions**: Why we chose this approach
- **Iteration log**: How we got here

```bash
# View requirement document for any artifact
curl http://localhost:3000/api/v1/artifacts/{id}/prd
```

### Systematic Learning

After each STANDARD+ execution, Atlas generates reflection:
- **Q1**: What would I do differently?
- **Q2**: What would a smarter workflow do?
- **Q3**: What would a smarter Atlas do?

Query reflections to identify patterns:
```bash
curl "http://localhost:3000/api/v1/reflections?workflow_id=brainstorm.v1"
```

### Adding Quality Criteria to Your Workflows

See the [AI Integration Guide](./docs/ai-integration.md) for the full guide. Quick start:

```typescript
export const myWorkflow: WorkflowPlugin = {
  id: "my.workflow.v1",
  isc: myWorkflowCriteria,  // Attach quality criteria
  async run(ctx, input, jobId) {
    // Verification happens automatically on emitArtifact()
    ctx.emitArtifact({ type: "my.artifact", content_md: result });
  }
};
```

## Documentation

**Getting Started:**
- [Docs Index](./docs/README.md) - Overview and concepts
- [Getting Started](./docs/getting-started.md) - Step-by-step setup
- [Configuration Guide](./docs/configuration.md) - Environment variables and routing

**Building Workflows:**
- [Workflow Authoring](./docs/workflow-authoring.md) - Creating custom workflows
- [AI Integration Guide](./docs/ai-integration.md) - Adding quality criteria
- [Curation Guide](./docs/curation.md) - Artifact management and deduplication

**APIs:**
- [OpenAI-Compatible API](./docs/openai-api.md) - OpenAI-compatible chat API
- [API Examples](./docs/api-examples.md) - API usage examples

**Architecture:**
- [Architecture](./docs/ARCHITECTURE.md) - System design
- [Versioning](./docs/VERSIONING.md) - Version compatibility
- [Alignment Checklist](./docs/alignment-checklist.md) - Safety considerations

## What Makes Atlas Different

**vs. ChatGPT/Claude Web UI:**
- Atlas produces **durable, verifiable artifacts** you can search and reuse
- **Traceable**: Every output has provenance (sources → workflow → criteria → reflection)
- **Systematic**: Not ad-hoc; every artifact is verified against explicit criteria

**vs. Other AI Workflow Tools:**
- **Quality-first**: Built-in verification prevents "garbage in, garbage out"
- **Self-improving**: Systematic reflection learns from every execution
- **Local-first**: Your data never leaves your machine
- **Deterministic**: Same inputs → same verification → reproducible outputs

**vs. Traditional Pipelines:**
- **AI-native**: Built for LLMs, not retrofitted
- **Flexible**: Criteria can use LLMs for subjective evaluation
- **Composable**: Workflows chain together naturally
- **Human-in-loop**: Checkpoints for approval, not autonomous agents

## License

MIT
