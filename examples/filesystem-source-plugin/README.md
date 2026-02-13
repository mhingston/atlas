# Filesystem Source Plugin for Atlas

Watches directories and ingests markdown/text files into Atlas.

## Installation

```bash
npm install @atlas/filesystem-source
```

## Configuration

Add to your `atlas.config.json`:

```json
{
  "plugins": [
    {
      "id": "atlas.filesystem-source",
      "source": "@atlas/filesystem-source",
      "enabled": true,
      "settings": {
        "watchPaths": ["/path/to/your/notes"],
        "includePatterns": ["**/*.md", "**/*.txt"],
        "excludePatterns": ["**/node_modules/**", "**/.git/**"],
        "defaultTags": ["notes", "personal"]
      }
    }
  ]
}
```

## Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `watchPaths` | string[] | Yes | - | Directories to watch |
| `includePatterns` | string[] | No | `["**/*.md", "**/*.txt", "**/*.mdx"]` | File patterns to include |
| `excludePatterns` | string[] | No | `["**/node_modules/**", "**/.git/**"]` | File patterns to exclude |
| `pollInterval` | number | No | `60` | How often to check for changes (seconds) |
| `defaultTags` | string[] | No | `["filesystem"]` | Tags to add to all files |

## What It Does

1. Scans configured directories recursively
2. Finds files matching `includePatterns`
3. Creates Atlas entities with:
   - File content
   - File metadata (size, timestamps)
   - Extracted tags (from `#hashtags` in content)
   - Default tags
   - Word count and line count

## Example

Given a file at `/notes/ideas.md`:

```markdown
# Project Ideas

## AI Assistant
Build a personal AI assistant #ai #productivity

## Notes
- Use #atlas for knowledge management
- Integrate with #llm providers
```

This creates an entity:
- **ID**: `fs:notes-ideas-md`
- **Title**: "Project Ideas" (extracted from H1)
- **Tags**: filesystem, notes, ai, productivity, atlas, llm
- **Content**: Full markdown content
- **Metadata**: File path, size, timestamps

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Test
npm test

# Link for local development
npm link
```

## License

MIT
