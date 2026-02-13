# Atlas Plugin Development Guide

## Overview

Atlas supports plugins that can be loaded from:
- **NPM packages**: `@atlas/filesystem-source`
- **GitHub repos**: `github:myuser/my-plugin`
- **Local paths**: `./my-plugin`
- **URLs**: `https://example.com/plugin.tgz`

Plugins live in separate repositories and follow a well-defined contract.

## Quick Start

### 1. Create Plugin Structure

```
my-atlas-plugin/
├── package.json
├── atlas.plugin.json          # Plugin manifest (required)
├── tsconfig.json
├── src/
│   └── index.ts               # Main entry point
└── README.md
```

### 2. Define the Manifest

Create `atlas.plugin.json`:

```json
{
  "id": "com.example.my-plugin",
  "name": "My Atlas Plugin",
  "version": "1.0.0",
  "apiVersion": "1.0",
  "description": "Does something useful with Atlas",
  "author": "Your Name",
  "license": "MIT",
  "entry": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "config": {
    "schema": {
      "apiKey": {
        "type": "string",
        "description": "API key for external service",
        "secret": true
      },
      "pollInterval": {
        "type": "number",
        "description": "How often to poll (seconds)",
        "default": 300
      }
    }
  }
}
```

### 3. Implement the Plugin

Create `src/index.ts`:

```typescript
import type { ExternalPlugin, PluginConfig } from "@mhingston5/atlas-plugin-sdk";
import { myWorkflow } from "./workflows/my-workflow";
import { mySource } from "./sources/my-source";

const plugin: ExternalPlugin = {
  manifest: {
    id: "com.example.my-plugin",
    name: "My Atlas Plugin",
    version: "1.0.0",
    apiVersion: "1.0",
    description: "Does something useful",
    author: "Your Name",
    license: "MIT",
    entry: "./dist/index.js",
  },

  async initialize(config: PluginConfig) {
    // Setup code here
    console.log(`Initializing ${config.id} with settings:`, config.settings);
  },

  async shutdown() {
    // Cleanup code here
    console.log("Shutting down plugin");
  },

  async health() {
    return {
      status: "healthy",
      checks: [
        { name: "api_connection", status: "pass" },
      ],
    };
  },

  // Plugin components
  workflows: [myWorkflow],
  sources: [mySource],
  sinks: [],
};

export default plugin;
```

### 4. Build and Test

```bash
# Install dependencies
npm install

# Build
npm run build

# Test locally
npm link
```

### 5. Publish

#### Option A: NPM (Recommended)

```bash
npm publish --access public
```

Users install with:
```bash
npm install @yourname/my-atlas-plugin
```

And configure in `atlas.config.json`:
```json
{
  "plugins": ["@yourname/my-atlas-plugin"]
}
```

#### Option B: GitHub

Push to GitHub and users can load with `atlas.config.json`:
```json
{
  "plugins": ["github:yourusername/my-atlas-plugin"]
}
```

Or pin to a specific version in `atlas.config.json`:
```json
{
  "plugins": ["github:yourusername/my-atlas-plugin#v1.0.0"]
}
```

## Plugin Components

### Workflow Plugins

```typescript
import type { WorkflowPlugin } from "@mhingston5/atlas-plugin-sdk";

export const myWorkflow: WorkflowPlugin = {
  id: "my.workflow.v1",
  
  async run(ctx, input, jobId) {
    // Access LLM
    const result = await ctx.llm.generateText({
      prompt: "Generate something",
      temperature: 0.7,
    });
    
    // Create artifact
    ctx.emitArtifact({
      type: "my.artifact.v1",
      job_id: jobId,
      title: "My Artifact",
      content_md: result.text,
      data: {
        schema_version: "1",
        produced_by: "my.workflow.v1",
      },
    });
    
    // Spawn another job
    ctx.spawnJob("another.workflow.v1", {
      input: "data",
    });
  },
};
```

### Source Plugins

```typescript
import type { SourcePlugin } from "@mhingston5/atlas-plugin-sdk";

export const mySource: SourcePlugin = {
  id: "my.source.v1",
  
  async sync(ctx) {
    // Fetch external data
    const data = await fetchExternalData();
    
    // Create entities
    for (const item of data) {
      ctx.commands.enqueue({
        type: "entity.upsert",
        entity: {
          id: `my-source:${item.id}`,
          type: "my.entity",
          source: "my.source.v1",
          title: item.title,
          data: item,
          updated_at: ctx.nowIso(),
        },
      });
    }
  },
};
```

### Sink Plugins

```typescript
import type { SinkPlugin } from "@mhingston5/atlas-plugin-sdk";

export const mySink: SinkPlugin = {
  id: "my.sink.v1",
  
  async flush(ctx, artifacts) {
    // Send artifacts to external system
    for (const artifact of artifacts) {
      await sendToExternalSystem(artifact);
    }
  },
};
```

## API Reference

### Plugin Manifest Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Unique identifier (reverse DNS format) |
| `name` | string | ✓ | Human-readable name |
| `version` | string | ✓ | Semver version |
| `apiVersion` | string | ✓ | Target Atlas API version |
| `description` | string | | What the plugin does |
| `author` | string | | Plugin author |
| `license` | string | | SPDX license identifier |
| `entry` | string | ✓ | Main entry point (JS file) |
| `types` | string | | TypeScript declarations |
| `config.schema` | object | | Configuration schema |

### Configuration Schema

```typescript
{
  "config": {
    "schema": {
      "apiKey": {
        "type": "string",
        "description": "API key",
        "secret": true        // Masked in logs
      },
      "interval": {
        "type": "number",
        "description": "Poll interval",
        "default": 300,
        "required": false
      },
      "tags": {
        "type": "array",
        "description": "Tags to add",
        "items": {
          "type": "string"
        }
      }
    }
  }
}
```

## Version Compatibility

Atlas uses semantic versioning for the plugin API:

- **Major version** (1.0 → 2.0): Breaking changes, plugins must update
- **Minor version** (1.0 → 1.1): New features, backward compatible
- **Patch version** (1.0.0 → 1.0.1): Bug fixes, fully compatible

Plugins declare their target API version in `apiVersion`. The loader checks compatibility on load.

## Best Practices

### 1. Error Handling

Always handle errors gracefully:

```typescript
async run(ctx, input, jobId) {
  try {
    const result = await riskyOperation();
    // ...
  } catch (err) {
    throw new Error(`Workflow failed: ${err.message}`);
  }
}
```

### 2. Configuration Validation

Validate config in `initialize`:

```typescript
async initialize(config: PluginConfig) {
  const apiKey = config.settings.apiKey;
  if (!apiKey) {
    throw new Error("Missing required config: apiKey");
  }
  
  // Test connection
  await testApiConnection(apiKey);
}
```

### 3. Health Checks

Implement health checks for external dependencies:

```typescript
async health() {
  const checks = [];
  
  // Check API connection
  try {
    await this.api.ping();
    checks.push({ name: "api", status: "pass" });
  } catch {
    checks.push({ name: "api", status: "fail", message: "API unreachable" });
  }
  
  const allPass = checks.every(c => c.status === "pass");
  return {
    status: allPass ? "healthy" : "unhealthy",
    checks,
  };
}
```

### 4. Resource Cleanup

Always clean up in `shutdown`:

```typescript
async shutdown() {
  // Close connections
  await this.api.disconnect();
  
  // Clear intervals/timeouts
  clearInterval(this.pollInterval);
  
  // Release file handles
  await this.fileHandle.close();
}
```

### 5. Testing

Test your plugin thoroughly:

```typescript
import { describe, expect, it } from "bun:test";
import plugin from "./index";

describe("My Plugin", () => {
  it("should have correct manifest", () => {
    expect(plugin.manifest.id).toBe("com.example.my-plugin");
    expect(plugin.manifest.apiVersion).toBe("1.0");
  });
  
  it("should initialize with config", async () => {
    await plugin.initialize({
      id: "test",
      source: "test",
      settings: { apiKey: "test-key" },
      enabled: true,
    });
  });
  
  it("should report health", async () => {
    const health = await plugin.health();
    expect(health.status).toBeOneOf(["healthy", "degraded", "unhealthy"]);
  });
});
```

## Examples

See the [Atlas Plugin Examples](https://github.com/yourorg/atlas-plugin-examples) repository for complete working examples:

- **filesystem-source**: Watch directories and ingest files
- **rss-source**: Poll RSS feeds
- **github-source**: Sync GitHub PRs and issues
- **webhook-sink**: Send artifacts to webhooks

## Troubleshooting

### Plugin fails to load

Check the error code:
- `MANIFEST_NOT_FOUND`: Missing `atlas.plugin.json`
- `MANIFEST_INVALID`: Invalid JSON or missing required fields
- `API_VERSION_MISMATCH`: Plugin targets different API version
- `LOAD_ERROR`: JavaScript error in plugin code
- `INITIALIZATION_ERROR`: Error in `initialize()` function

### Enable debug logging

```bash
ATLAS_LOG_LEVEL=debug bun run src/index.ts
```

### Clear plugin cache

If you update a plugin and changes don't appear:

```bash
rm -rf /tmp/atlas-plugins
```

Or set a different cache directory:

```bash
ATLAS_PLUGIN_CACHE=/path/to/cache bun run src/index.ts
```

## Support

- GitHub Issues: Report bugs or request features
- Discord: Join the Atlas community
- Documentation: [https://docs.atlas.dev](https://docs.atlas.dev)

## License

Your plugin can use any license. We recommend MIT for maximum compatibility.
