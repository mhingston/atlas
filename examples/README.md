# Atlas Plugin Examples

This directory contains example plugins demonstrating how to build Atlas plugins using the `@mhingston5/atlas-plugin-sdk`.

## Available Examples

### 1. Filesystem Source Plugin

A complete source plugin that watches directories and ingests markdown/text files.

**Location:** `filesystem-source-plugin/`

**Features:**
- Recursively scans directories
- Pattern matching (include/exclude)
- Extracts hashtags as tags
- Calculates word/line counts
- Full manifest with config schema
- Health checks
- Lifecycle hooks (init/shutdown)

**Usage:**
```bash
cd filesystem-source-plugin
npm install
npm run build
```

## Plugin Development Checklist

To create your own plugin:

### 1. Setup
- [ ] Create new directory
- [ ] Copy `package.json` template
- [ ] Update name, description, author

### 2. Manifest
- [ ] Create `atlas.plugin.json`
- [ ] Define unique ID (reverse DNS format)
- [ ] Specify `apiVersion` (current: `1.0`)
- [ ] Add config schema if needed

### 3. Implementation
- [ ] Import from `@mhingston5/atlas-plugin-sdk`
- [ ] Implement plugin components (workflows/sources/sinks)
- [ ] Export default plugin instance

### 4. Testing
- [ ] Write unit tests
- [ ] Test with local Atlas instance
- [ ] Verify manifest validation

### 5. Distribution
- [ ] Build with `npm run build`
- [ ] Publish to NPM (optional)
- [ ] Or use from GitHub: `github:yourname/your-plugin`

## Quick Start Template

```typescript
// src/index.ts
import { createPlugin, createWorkflowPlugin } from '@mhingston5/atlas-plugin-sdk';

const myWorkflow = createWorkflowPlugin('my.workflow', async (ctx, input, jobId) => {
  const result = await ctx.llm.generateText({ prompt: 'Hello World' });
  
  ctx.emitArtifact({
    type: 'my.result',
    job_id: jobId,
    title: 'My Result',
    content_md: result.text,
    data: { schema_version: '1' },
  });
});

export default createPlugin({
  manifest: {
    id: 'com.example.my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    apiVersion: '1.0',
    entry: './dist/index.js',
  },
  workflows: [myWorkflow],
});
```

```json
// atlas.plugin.json
{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "apiVersion": "1.0",
  "entry": "./dist/index.js"
}
```

## Loading Plugins in Atlas

### From NPM
```json
{
  "plugins": ["@atlas/filesystem-source"]
}
```

### From GitHub
```json
{
  "plugins": ["github:myuser/my-atlas-plugin"]
}
```

### From Local Path
```json
{
  "plugins": ["./path/to/plugin"]
}
```

## Resources

- [Plugin SDK Documentation](../plugin-sdk/README.md)
- [Plugin Development Guide](../docs/plugin-development.md)
- [Core Plugin Loader](../src/plugins/external/loader.ts)
