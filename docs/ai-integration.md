# AI Integration Guide

## Overview

Atlas provides two runtime abstractions for AI integration:

1. **LLMRuntime** - Core text generation using AI SDK
2. **HarnessRuntime** - Optional agent/tool execution for code tasks

## LLMRuntime

### Architecture

LLMRuntime is a thin wrapper around the [AI SDK](https://sdk.vercel.ai/docs) that provides:

- Consistent interface across providers
- Dynamic provider loading (install only what you need)
- Policy-based access control
- Usage tracking and provenance

### Agent Instructions (AGENTS.md) + Skills

Atlas can enrich LLM calls with project instructions and skill content.

- **AGENTS.md**: Loaded from the repo root and injected into the system
  prompt for every LLM call.
- **Skills (SKILL.md)**: Parsed from skill directories and injected when
  requested or auto-selected.

By default Atlas looks for:

- `AGENTS.md` in the current working directory
- Skills in `.github/skills/**/SKILL.md`

You can override this via environment variables in
[Configuration Guide](./configuration.md).

#### Usage in Workflows

```typescript
const result = await ctx.llm.generateText({
  prompt: "Find CI failures and suggest fixes",
  skills: ["diagnose-ci-failure"],
});
```

Auto-select skills by name (case-insensitive match against the prompt):

```typescript
const result = await ctx.llm.generateText({
  prompt: "Run the agent-browser flow for signup",
  autoSkills: true,
});
```

Auto-selection is enabled by default and can be disabled by setting
`ATLAS_SKILLS_AUTO=false`.

### Supported Providers

Atlas works with **any Vercel AI SDK provider**. Common examples:

- **OpenAI** (GPT-4o, GPT-4o-mini, etc.) - `@ai-sdk/openai`
- **Anthropic** (Claude 3.5 Sonnet, etc.) - `@ai-sdk/anthropic`
- **Google** (Gemini Pro, etc.) - `@ai-sdk/google`
- **Mistral** - `@ai-sdk/mistral`
- **Ollama** (Local models) - `ollama-ai-provider`
- **Mock** (Testing/development) - built-in

You can use any provider by configuring the package and factory function.

### Installation

#### Common Providers (Preset Configuration)

```bash
# OpenAI
bun add @ai-sdk/openai

# Anthropic
bun add @ai-sdk/anthropic

# Google
bun add @ai-sdk/google

# Ollama
bun add ollama-ai-provider
```

#### Any AI SDK Provider

Atlas supports **any** Vercel AI SDK provider. For providers not listed above:

```bash
# Install the provider package
bun add @ai-sdk/<provider>

# Configure via environment variables
ATLAS_LLM_PROVIDER=custom
ATLAS_LLM_PACKAGE=@ai-sdk/<provider>
ATLAS_LLM_FACTORY=create<Provider>
ATLAS_LLM_MODEL=model-name
<PROVIDER>_API_KEY=...
```

### Configuration

#### Preset Providers

Set environment variables for common providers (OpenAI, Anthropic, Ollama):

```bash
# Choose provider
ATLAS_LLM_PROVIDER=openai

# Provider-specific config
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

#### Custom Providers

For any other Vercel AI SDK provider:

```bash
# Example: Google Gemini
ATLAS_LLM_PROVIDER=custom
ATLAS_LLM_PACKAGE=@ai-sdk/google
ATLAS_LLM_FACTORY=createGoogleGenerativeAI
ATLAS_LLM_MODEL=gemini-pro
GOOGLE_GENERATIVE_AI_API_KEY=...
```

If you are using provider routing (`gateway.routing.json`), add `custom` to the
desired LLM profiles so the router will select it:

```json
"llm": {
  "default_profile": "balanced",
  "profiles": {
    "fast": ["custom", "ollama", "openai-mini"],
    "balanced": ["custom", "openai-mini", "anthropic-haiku"],
    "quality": ["custom", "openai", "anthropic-sonnet"]
  },
  "fallback": ["mock"]
}
```

See [Configuration Guide](./configuration.md) for all options.

### Usage in Workflows

Workflows access LLM via `ctx.llm`:

```typescript
import type { WorkflowPlugin } from "../types";

export const myWorkflow: WorkflowPlugin = {
  id: "my.workflow.v1",
  
  async run(ctx, input, jobId) {
    const result = await ctx.llm.generateText({
      system: "You are a helpful assistant.",
      prompt: "Write a haiku about TypeScript",
      temperature: 0.7,
      maxTokens: 100,
    });

    console.log(result.text);
    console.log(`Provider: ${result.provider}`);
    console.log(`Tokens: ${result.usage?.totalTokens}`);
  },
};
```

### Thinking Workflows (Scratchpad + Review)

Atlas includes a scratchpad workflow and a review variant that emits a decision note and requires approval by default.

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "scratchpad.review.v1",
    "input": {
      "topic": "AI tooling alignment",
      "intent": "synthesis",
      "constraints": ["be explicit about gaps", "cite context"],
      "k": 8
    }
  }'
```

### Policy Requirements

Workflows must have the `llm:generate` capability to use LLM features.

By default, workflows are granted this capability. If a workflow lacks it, calls to `ctx.llm.generateText()` will throw a `PolicyError`.

### Mock Provider

The mock provider is useful for:

- Testing workflows without API keys
- Development without external dependencies
- CI/CD pipelines

Set `ATLAS_LLM_PROVIDER=mock` or omit the variable entirely.

## HarnessRuntime

### What is a Harness?

Harnesses are tool-executing agents (like Codex CLI, OpenCode, Claude Code) that:

- Read and write files
- Execute commands
- Run tests
- Produce diffs and plans

They differ from LLMs in that they **take actions** rather than just generating text.

### Interface

Workflows access harness via `ctx.harness` (if enabled):

```typescript
export const codeWorkflow: WorkflowPlugin = {
  id: "code.task.v1",
  
  async run(ctx, input, jobId) {
    if (!ctx.harness) {
      throw new Error("Harness not available");
    }

    const result = await ctx.harness.runTask({
      harnessId: "codex-cli",
      goal: "Add error handling to the API routes",
      cwd: "/path/to/repo",
      mode: "propose",  // plan | propose | apply
    });

    // result.outputs contains: text, diff, file, command_log
    for (const output of result.outputs) {
      if (output.type === "diff") {
        console.log("Proposed changes:", output.diff);
      }
    }
  },
};
```

### Modes

- **plan** - Generate a plan, no code changes
- **propose** - Generate code changes as proposals (diffs)
- **apply** - Apply changes to files (requires explicit policy)

**Default:** `propose` (safe, no auto-apply)

### Artifacts

Harness outputs are converted to artifacts:

- `code.plan.v1` - Text plan with steps
- `code.patch.v1` - Diff/patch output
- `code.runlog.v1` - Command execution logs
- `code.file.v1` - File contents

See the `code.assist.v1` workflow for a reference implementation.

### Configuration

Harnesses are **config-driven** - add them to `gateway.routing.json`:

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
ATLAS_HARNESS_ENABLED=true
```

See [Provider Routing Guide](./provider-routing.md) for complete harness configuration details including:
- Argument templating
- Output parsing strategies
- Multiple harness examples (codex-cli, opencode, aider)

### Policy Requirements

Harnesses require additional capabilities:

- `exec:<harness-id>` - Execute specific harness (e.g., `exec:codex-cli`)
- `fs:read:<path>` - Read files in specified path
- `fs:write:<path>` - Write files (only in "apply" mode)

These are **NOT** granted by default for safety.

### Safety

1. **No auto-apply** - Harnesses default to "propose" mode
2. **Policy enforcement** - File and command access gated by capabilities
3. **Scoped operations** - Working directory restrictions
4. **Timeouts** - Budget limits on execution time
5. **Command allowlisting** - Only approved commands (when implemented)

## Examples

### Simple Text Generation

```typescript
const result = await ctx.llm.generateText({
  prompt: "Summarize this code review",
  temperature: 0.3,
});
```

### Structured Brainstorming

```typescript
const result = await ctx.llm.generateText({
  system: "You are a creative brainstorming assistant.",
  prompt: `Generate ideas for: ${topic}`,
  temperature: 0.8,
  maxTokens: 1000,
});

ctx.emitArtifact({
  type: "brainstorm.session.v1",
  job_id: jobId,
  content_md: result.text,
  data: {
    llm_provider: result.provider,
    llm_usage: result.usage,
  },
});
```

### Code Assistance with Harness

```typescript
if (ctx.harness) {
  const result = await ctx.harness.runTask({
    harnessId: "default",
    goal: input.goal,
    cwd: input.repoPath,
    mode: "propose",
  });

  // Emit artifacts for each output
  for (const output of result.outputs) {
    // ... process outputs
  }
}
```

## Troubleshooting

### "Provider X requires package Y"

You need to install the provider package:

```bash
bun add @ai-sdk/openai
```

### "Permission denied: llm:generate"

The workflow lacks the required capability. Ensure the policy grants `llm:generate` (it does by default).

### "Harness not available"

Set `ATLAS_HARNESS_ENABLED=true` in your environment.

### Mock provider returns placeholders

This is expected behavior. Configure a real provider or use the mock for testing only.

## Next Steps

- [Configuration Guide](./configuration.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [Creating Workflows](./workflows.md) (if exists)
