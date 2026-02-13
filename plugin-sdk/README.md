# @mhingston5/atlas-plugin-sdk

Official SDK for building Atlas plugins.

## What is Atlas?

Atlas is a local-first, plugin-based personal AI assistant. It ingests data from multiple sources, runs AI-powered workflows, and produces durable artifacts.

## Installation

```bash
npm install @mhingston5/atlas-plugin-sdk
```

## Quick Start

### 1. Create a Plugin

```typescript
import { createPlugin, createWorkflowPlugin } from '@mhingston5/atlas-plugin-sdk';

const myWorkflow = createWorkflowPlugin('my.workflow.v1', async (ctx, input, jobId) => {
  // Use LLM to generate content
  const result = await ctx.llm.generateText({
    prompt: `Process this input: ${JSON.stringify(input)}`,
    temperature: 0.7,
  });
  
  // Create an artifact
  ctx.emitArtifact({
    type: 'my.artifact.v1',
    job_id: jobId,
    title: 'My Workflow Result',
    content_md: result.text,
    data: {
      schema_version: '1',
      produced_by: 'my.workflow.v1',
    },
  });
});

export default createPlugin({
  manifest: {
    id: 'com.example.my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    apiVersion: '1.0',
    description: 'Does something useful',
    author: 'Your Name',
    license: 'MIT',
    entry: './dist/index.js',
  },
  workflows: [myWorkflow],
});
```

### 2. Create atlas.plugin.json

```json
{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "apiVersion": "1.0",
  "description": "Does something useful",
  "author": "Your Name",
  "license": "MIT",
  "entry": "./dist/index.js",
  "config": {
    "schema": {
      "apiKey": {
        "type": "string",
        "description": "API key for external service",
        "secret": true
      }
    }
  }
}
```

### 3. Build and Test

```bash
npm run build
npm test
```

### 4. Publish

```bash
npm publish --access public
```

## Plugin Types

### Workflow Plugin

Workflows process data and create artifacts:

```typescript
import { createWorkflowPlugin } from '@mhingston5/atlas-plugin-sdk';

const workflow = createWorkflowPlugin('my.workflow', async (ctx, input, jobId) => {
  // Access LLM
  const result = await ctx.llm.generateText({ prompt: 'Hello' });
  
  // Access database
  const artifacts = ctx.findArtifacts({ type: 'note', limit: 10 });
  
  // Create artifact
  ctx.emitArtifact({ type: 'my.result', job_id: jobId, data: {} });
  
  // Spawn another job
  ctx.spawnJob('other.workflow', { data: 'value' });
});
```

### Source Plugin

Sources sync external data:

```typescript
import { createSourcePlugin } from '@mhingston5/atlas-plugin-sdk';

const source = createSourcePlugin('my.source', async (ctx) => {
  // Fetch data from external API
  const data = await fetchExternalData();
  
  // Create entities
  for (const item of data) {
    ctx.commands.enqueue({
      type: 'entity.upsert',
      entity: {
        id: `my-source:${item.id}`,
        type: 'my.entity',
        source: 'my.source',
        title: item.title,
        data: item,
        updated_at: ctx.nowIso(),
      },
    });
  }
});
```

### Sink Plugin

Sinks send data to external systems:

```typescript
import { createSinkPlugin } from '@mhingston5/atlas-plugin-sdk';

const sink = createSinkPlugin('my.sink', async (ctx, artifacts) => {
  for (const artifact of artifacts) {
    await sendToExternalSystem(artifact);
  }
});
```

## API Reference

### Types

- `ExternalPlugin` - Main plugin interface
- `WorkflowPlugin` - Workflow component
- `SourcePlugin` - Source component
- `SinkPlugin` - Sink component
- `PluginManifest` - Plugin metadata
- `WorkflowContext` - Context passed to workflows
- `SourceContext` - Context passed to sources
- `SinkContext` - Context passed to sinks

### Utilities

- `createPlugin()` - Create external plugin with all components
- `createWorkflowPlugin()` - Create workflow component
- `createSourcePlugin()` - Create source component
- `createSinkPlugin()` - Create sink component
- `createArtifact()` - Builder for creating artifacts
- `createEntity()` - Create entity objects
- `createEvent()` - Create event objects
- `generateId()` - Generate unique IDs
- `nowIso()` - Get current ISO timestamp
- `truncate()` - Truncate text
- `extractTags()` - Extract hashtags from text
- `retry()` - Retry async operations
- `sleep()` - Delay execution

### Manifest Utilities

- `validateManifest()` - Validate plugin manifest
- `checkApiCompatibility()` - Check version compatibility
- `validateConfig()` - Validate plugin config
- `applyConfigDefaults()` - Apply default config values

## Examples

### Brainstorm Workflow

```typescript
import { createWorkflowPlugin, createArtifact } from '@mhingston5/atlas-plugin-sdk';

export const brainstormWorkflow = createWorkflowPlugin(
  'brainstorm.v1',
  async (ctx, input, jobId) => {
    const topic = input.topic;
    
    const result = await ctx.llm.generateText({
      prompt: `Brainstorm ideas about: ${topic}`,
      temperature: 0.8,
    });
    
    ctx.emitArtifact(
      createArtifact('brainstorm.session')
        .jobId(jobId)
        .title(`Brainstorm: ${topic}`)
        .content(result.text)
        .data({ topic, schema_version: '1' })
        .build()
    );
  }
);
```

### RSS Source

```typescript
import { createSourcePlugin, createEntity, nowIso } from '@mhingston5/atlas-plugin-sdk';

export const rssSource = createSourcePlugin('rss.source', async (ctx) => {
  const feed = await parseRssFeed('https://example.com/feed.xml');
  
  for (const item of feed.items) {
    ctx.commands.enqueue({
      type: 'entity.upsert',
      entity: createEntity('rss.source', 'rss.article', item.id, {
        title: item.title,
        url: item.link,
        content: item.content,
        published_at: item.pubDate,
      }),
    });
  }
});
```

## Configuration

Plugins can define a configuration schema:

```json
{
  "config": {
    "schema": {
      "apiKey": {
        "type": "string",
        "description": "External API key",
        "secret": true
      },
      "interval": {
        "type": "number",
        "description": "Poll interval in seconds",
        "default": 300
      },
      "tags": {
        "type": "array",
        "description": "Default tags to add",
        "items": {
          "type": "string"
        },
        "default": []
      }
    }
  }
}
```

Access config in your plugin:

```typescript
async initialize(config) {
  const apiKey = config.settings.apiKey;
  const interval = config.settings.interval ?? 300;
}
```

## Version Compatibility

Atlas uses semantic versioning for the plugin API:

- **Major version** (1.0 → 2.0): Breaking changes
- **Minor version** (1.0 → 1.1): New features, backward compatible
- **Patch version** (1.0.0 → 1.0.1): Bug fixes

Plugins declare their target API version in `apiVersion`. Atlas checks compatibility on load.

## Development

### Local Development

```bash
# Link for local development
npm link

# In your plugin project
npm link @mhingston5/atlas-plugin-sdk
```

### Testing

```bash
npm test
```

### Building

```bash
npm run build
```

## License

MIT

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Support

- GitHub Issues: https://github.com/atlas-ai/plugin-sdk/issues
- Documentation: https://docs.atlas.dev
- Discord: https://discord.gg/atlas
