# Provider Routing

Atlas Gateway now supports **provider routing** for LLM and Harness backends, enabling automatic failover and profile-based provider selection.

## Features

- **Multi-provider fallback**: Automatically try providers in order until one succeeds
- **Profile-based routing**: Select providers based on `fast`, `balanced`, or `quality` profiles
- **Centralized configuration**: Define routing rules in `gateway.routing.json`
- **Zero-config defaults**: Works out-of-the-box with sensible defaults (mock/noop)


## Configuration

### Basic Setup

Create a `gateway.routing.json` file in your project root:

```json
{
  "llm": {
    "default_profile": "balanced",
    "profiles": {
      "fast": ["ollama", "mock"],
      "balanced": ["openai", "anthropic", "mock"],
      "quality": ["anthropic", "openai"]
    },
    "fallback": ["mock"]
  },
  "harness": {
    "default_profile": "balanced",
    "profiles": {
      "fast": ["noop"],
      "balanced": ["codex-cli", "noop"],
      "quality": ["codex-cli", "noop"]
    },
    "fallback": ["noop"]
  },
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

### Profile Meanings

- **fast**: Optimized for speed (smaller/faster models, local providers)
- **balanced**: Balance between speed and quality (default)
- **quality**: Optimized for best results (larger/more capable models)

## Usage in Workflows

### Using Profiles

```typescript
// Default profile (balanced)
const result = await ctx.llm.generateText({ 
  prompt: "Write a haiku" 
});

// Fast profile for quick responses
const fastResult = await ctx.llm.generateText({ 
  prompt: "Summarize this",
  profile: "fast" 
});

// Quality profile for complex tasks
const qualityResult = await ctx.llm.generateText({ 
  prompt: "Write detailed documentation",
  profile: "quality" 
});
```

### Harness Routing

```typescript
// Use routing to select harness
const result = await ctx.harness?.runTask({
  goal: "Fix the bug in auth.ts",
  cwd: process.cwd(),
  profile: "quality"
});

// Override with explicit harness
const result = await ctx.harness?.runTask({
  goal: "Generate tests",
  cwd: process.cwd(),
  harnessId: "codex-cli"
});
```

## How It Works

1. **Registry Building**: At startup, Atlas scans environment variables to detect available providers
2. **Router Construction**: Creates router runtimes with backend registries
3. **Profile Resolution**: When generating text, selects candidate list based on profile
4. **Fallback Chain**: Tries providers in order, automatically falling back on errors
5. **Result Metadata**: Returns which provider was actually used in the `provider` field

## Available Backends

### LLM Backends

- `openai` - Requires `OPENAI_API_KEY`
- `anthropic` - Requires `ANTHROPIC_API_KEY`
- `ollama` - Requires `OLLAMA_BASE_URL` or `OLLAMA_MODEL`
- `custom` - Any AI SDK provider configured via `ATLAS_LLM_PACKAGE` + `ATLAS_LLM_FACTORY`
- `mock` - Always available (no-op responses)

When using `custom`, be sure the `gateway.routing.json` profile lists `custom`
before `mock`, otherwise the router will never select it.

### Harness Backends

Harnesses are **config-driven CLI wrappers** defined in `gateway.routing.json`:

- `noop` - Always available (placeholder implementation)
- `codex-cli` - GitHub Copilot CLI (configured)
- `opencode` - OpenCode CLI (configured)
- `aider` - Aider CLI (configured)

You can add any CLI-based code assistant by adding a harness definition.

## Availability Detection

**LLM Providers** are automatically detected based on:
- API key environment variables
- Configuration environment variables
- Package installation

**Harness Providers** are detected based on:
- Command availability (via `which <command>`)
- Only harnesses with installed CLIs are included in routing

Only available providers are included in routing.

## Configuring Harnesses

Harnesses are CLI-based code assistants configured via the `harnesses` section in `gateway.routing.json`.

### Configuration Schema

```typescript
{
  "harnesses": {
    "<harness-id>": {
      "command": string,              // CLI command to execute
      "args_template"?: string[],     // Template for command arguments
      "output_parsers"?: {            // How to parse CLI output
        "diff"?: OutputParser,
        "plan"?: OutputParser,
        "text"?: OutputParser,
        "command_log"?: OutputParser
      },
      "timeout_ms"?: number,          // Execution timeout
      "env"?: Record<string, string>  // Environment variables
    }
  }
}
```

### Argument Templates

Use template variables in `args_template` to inject harness arguments:

- `{goal}` - The task goal/description
- `{cwd}` - Working directory
- `{mode}` - Execution mode (plan/propose/apply)
- `{profile}` - Quality profile (fast/balanced/quality)

**Example:**
```json
"args_template": ["--goal", "{goal}", "--cwd", "{cwd}", "--mode", "{mode}"]
```

### Output Parsers

Define how to extract structured data from CLI output:

#### `stdout_all`
Captures entire stdout as text:
```json
{ "type": "stdout_all" }
```

#### `stdout_section`
Extracts text between markers:
```json
{
  "type": "stdout_section",
  "start_marker": "diff --git",
  "end_marker": "\n\n"
}
```

#### `json_field`
Parses JSON output and extracts a field:
```json
{
  "type": "json_field",
  "field": "changes"
}
```

#### `file_glob`
Reads files matching a pattern in the working directory:
```json
{
  "type": "file_glob",
  "pattern": "*.patch"
}
```

#### `exit_code`
Uses exit code for success/failure (metadata only):
```json
{ "type": "exit_code" }
```

### Example Configurations

#### GitHub Copilot CLI
```json
{
  "codex-cli": {
    "command": "copilot",
    "args_template": ["--goal", "{goal}", "--cwd", "{cwd}"],
    "output_parsers": {
      "text": { "type": "stdout_all" }
    },
    "timeout_ms": 300000
  }
}
```

#### OpenCode
```json
{
  "opencode": {
    "command": "opencode",
    "args_template": [
      "execute",
      "--task", "{goal}",
      "--directory", "{cwd}",
      "--format", "json"
    ],
    "output_parsers": {
      "diff": { "type": "json_field", "field": "changes" },
      "plan": { "type": "json_field", "field": "plan" }
    },
    "timeout_ms": 180000
  }
}
```

#### Aider
```json
{
  "aider": {
    "command": "aider",
    "args_template": ["--yes", "--message", "{goal}"],
    "output_parsers": {
      "diff": {
        "type": "stdout_section",
        "start_marker": "diff --git",
        "end_marker": "\n\n"
      },
      "text": { "type": "stdout_all" }
    },
    "timeout_ms": 600000
  }
}
```

### Security Considerations

Harness execution requires policy capabilities:
- `exec:<harness-id>` - Permission to execute the specific harness
- `fs:read:<path>` - Permission to read files
- `fs:write:<path>` - Permission to write files (apply mode only)

These are **NOT granted by default**. Update your workflow policy to grant capabilities.

**Example policy:**
```typescript
policy.grant('exec:codex-cli');
policy.grant('fs:read:/path/to/repo');
// Only grant write for trusted workflows
policy.grant('fs:write:/path/to/repo');
```

## Default Behavior

Without `gateway.routing.json`, Atlas uses these defaults:

- **LLM**: All profiles use `mock` provider
- **Harness**: All profiles use `noop` harness
- **No errors**: System works out-of-the-box for testing

## Provider Field

All LLM and Harness results include a `provider` field indicating which backend was used:

```typescript
const result = await ctx.llm.generateText({ prompt: "test" });
console.log(result.provider); // "openai", "anthropic", "mock", etc.
```

This enables:
- Tracking which providers are being used
- Cost analysis by provider
- Debugging routing behavior
- Audit logging

## Error Handling

If no providers are available after trying all candidates:
- LLM: Throws `NoAvailableProviderError("llm")`
- Harness: Throws `NoAvailableProviderError("harness")`

Always include `mock`/`noop` in fallback lists to guarantee availability.

## Getting Started

1. Add `gateway.routing.json` to your project
2. Configure provider API keys
3. Optionally specify profiles in workflow calls
4. For harnesses, add harness definitions to the config

### Testing

The mock provider is always available, so tests work without any configuration:

```typescript
const result = await ctx.llm.generateText({ prompt: "test" });
expect(result.provider).toBe("mock");
```
