# Getting Started

## Install

```bash
bun install
```

## Run

```bash
bun run dev
```

The server starts on `http://localhost:3000` with the **mock LLM provider** by
default (no API keys required).

## Verify

```bash
curl http://localhost:3000/health
```

## Create Your First Job

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"workflow_id":"brainstorm.v1","input":{"topic":"first run"}}'
```

## Configure a Real Provider (Optional)

```bash
bun add @ai-sdk/openai
export ATLAS_LLM_PROVIDER=openai
export OPENAI_API_KEY=sk-...
bun run dev
```

## External Plugins (Optional)

Create `atlas.config.json`:

```json
{
  "plugins": ["github:yourusername/my-atlas-plugin"]
}
```

See the [Plugin Development Guide](./plugin-development.md) for full details.

More provider options: [AI Integration Guide](./ai-integration.md)
