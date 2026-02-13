# Configuration Guide

## Environment Variables

### LLM Provider Configuration

#### ATLAS_LLM_PROVIDER
Selects which LLM provider to use.

**Values:** `mock`, `openai`, `anthropic`, `ollama`, or `custom` (for any AI SDK provider)  
**Default:** `mock`

```bash
ATLAS_LLM_PROVIDER=openai
```

#### ATLAS_LLM_PROVIDER_FALLBACK
What to do when the configured provider is not available.

**Values:** `mock`, `error`  
**Default:** `error`

```bash
ATLAS_LLM_PROVIDER_FALLBACK=mock
```

### Provider-Specific Configuration

#### OpenAI

```bash
ATLAS_LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini  # optional, defaults to gpt-4o-mini
```

**Installation:**
```bash
bun add @ai-sdk/openai
```

#### Anthropic

```bash
ATLAS_LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022  # optional
```

**Installation:**
```bash
bun add @ai-sdk/anthropic
```

#### Ollama

```bash
ATLAS_LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434  # optional
OLLAMA_MODEL=llama3.2  # optional
```

**Installation:**
```bash
bun add ollama-ai-provider
```

#### Custom Provider (Any AI SDK Provider)

For any Vercel AI SDK provider not listed above:

```bash
# Example: Google Gemini
ATLAS_LLM_PROVIDER=custom
ATLAS_LLM_PACKAGE=@ai-sdk/google
ATLAS_LLM_FACTORY=createGoogleGenerativeAI
ATLAS_LLM_MODEL=gemini-pro
ATLAS_LLM_API_KEY=...  # or provider-specific env var
```

```bash
# Example: Mistral
ATLAS_LLM_PROVIDER=custom
ATLAS_LLM_PACKAGE=@ai-sdk/mistral
ATLAS_LLM_FACTORY=createMistral
ATLAS_LLM_MODEL=mistral-large-latest
ATLAS_LLM_API_KEY=...
```

**Installation:**
```bash
bun add @ai-sdk/<provider>
```

**Configuration variables:**
- `ATLAS_LLM_PACKAGE` - Package name (defaults to ATLAS_LLM_PROVIDER)
- `ATLAS_LLM_FACTORY` - Factory function name (e.g., `createGoogleGenerativeAI`)
- `ATLAS_LLM_MODEL` - Model name
- `ATLAS_LLM_API_KEY` - Generic API key
- `ATLAS_LLM_BASE_URL` - Custom base URL (optional)

### Agent Instructions & Skills

#### ATLAS_AGENTS_PATHS
Comma-separated list of `AGENTS.md` paths (relative to cwd).

**Default:** `AGENTS.md`

```bash
ATLAS_AGENTS_PATHS=AGENTS.md,docs/AGENTS.md
```

#### ATLAS_SKILLS_PATHS
Comma-separated list of directories to scan for `SKILL.md`.

**Default:** `.github/skills,skills`

```bash
ATLAS_SKILLS_PATHS=.github/skills,skills
```

#### ATLAS_SKILLS_AUTO
When `true`, auto-select skills by matching skill names against the
prompt/system input.

**Default:** `true`

```bash
ATLAS_SKILLS_AUTO=true
```

#### ATLAS_SKILLS_CONTEXT_MAX_CHARS
Maximum characters injected into the system prompt for AGENTS + skills.

**Default:** `24000`

```bash
ATLAS_SKILLS_CONTEXT_MAX_CHARS=18000
```

### Memory Files

#### ATLAS_MEMORY_PATHS
Comma-separated list of paths to scan for memory files. Files are indexed as
entities of type `memory.file` via the `memory.source` plugin.

**Default:** `MEMORY.md,memory`

```bash
ATLAS_MEMORY_PATHS=MEMORY.md,memory,notes/memory
```

### Harness Configuration

#### ATLAS_HARNESS_ENABLED
Enable or disable harness runtime for code assistance workflows.

**Values:** `true`, `false`  
**Default:** `false`

```bash
ATLAS_HARNESS_ENABLED=true
```

#### ATLAS_HARNESS_DEFAULT
**Deprecated:** Use routing profiles in `gateway.routing.json` instead.

Harnesses are now configured via the `harnesses` section in routing config.
See [Provider Routing Guide](./provider-routing.md) for details.

### Database Configuration

#### ATLAS_DB_PATH
Path to SQLite database file.

**Default:** `data/atlas.db`

```bash
ATLAS_DB_PATH=./my-atlas.db
```

### Server Configuration

#### PORT
HTTP server port.

**Default:** `3000`

```bash
PORT=8080
```

### Workflow Scheduling (External Cron)

Atlas does not run internal workflow schedules. For single-user setups, use
cron (or a systemd timer) to call the CLI or HTTP API.

#### Cron via CLI

```bash
# Weekly digest (every Monday at 09:00 local time)
0 9 * * 1 ATLAS_URL=http://localhost:3000 atlas jobs create digest.weekly.v1 \
  --input='{"query":"weekly highlights","owner_type":"artifact","k":10,"limit":200}'

# Daily embeddings index (02:00 local time)
0 2 * * * ATLAS_URL=http://localhost:3000 atlas jobs create index.embeddings.v1 \
  --input='{"owner_type":"artifact","limit":200,"since":"2026-01-01T00:00:00.000Z"}'
```

#### Cron via HTTP

```bash
0 9 * * 1 curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"workflow_id":"digest.weekly.v1","input":{"query":"weekly highlights","owner_type":"artifact","k":10,"limit":200}}'
```

## Example Configurations

### Development (Mock Provider)
```bash
# .env
ATLAS_LLM_PROVIDER=mock
ATLAS_HARNESS_ENABLED=false
```

### Production (OpenAI)
```bash
# .env
ATLAS_LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
ATLAS_LLM_PROVIDER_FALLBACK=error
ATLAS_HARNESS_ENABLED=false
```

### Local Development (Ollama)
```bash
# .env
ATLAS_LLM_PROVIDER=ollama
OLLAMA_MODEL=llama3.2
ATLAS_HARNESS_ENABLED=false
```

## Policy & Capabilities

Atlas uses a capability-based security model to control what workflows can do.

### Default Workflow Capabilities

- ✅ `db:read` - Read entities, events, artifacts
- ✅ `llm:generate` - Use LLM for text generation
- ❌ `db:write` - Write to database (denied by default)
- ❌ `exec:*` - Execute commands (denied by default)
- ❌ `fs:write:*` - Write to filesystem (denied by default)

### Workflow-Declared Capabilities

Workflows can explicitly declare required capabilities. When declared, Atlas
grants only `db:read` plus the listed capabilities (instead of the defaults).

Example (deterministic workflow, no LLM):
```ts
export const digestDailyWorkflow: WorkflowPlugin = {
  id: "digest.daily.v1",
  capabilities: ["db:read"],
  async run(ctx, input, jobId) {
    // Deterministic logic here
  },
};
```

### Harness Capabilities

Harnesses are CLI-based code assistants configured in `gateway.routing.json`.

When enabled, harness workflows require additional capabilities:

- `exec:<harness-id>` - Execute specific harness (e.g., `exec:codex-cli`)
- `fs:read:<path>` - Read files in working directory
- `fs:write:<path>` - Write files (only in "apply" mode)

These are NOT granted by default for safety reasons. Update your policy to grant these capabilities to specific workflows.

**Example harness configuration:**
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

See [Provider Routing Guide](./provider-routing.md) for full harness configuration details.

## Safety Defaults

1. **LLM operations**: Allowed by default via `llm:generate` capability
2. **Command execution**: Denied by default (no `exec:*`)
3. **File writes**: Denied by default (no `fs:write:*`)
4. **Harness mode**: Defaults to "propose", never "apply"
5. **Auto-apply**: Explicitly disabled - requires user confirmation mechanism (future)

## Next Steps

- [AI Integration Guide](./ai-integration.md)
- [Architecture Overview](./ARCHITECTURE.md)
