# Atlas Versioning Strategy

This document explains how versioning works across the Atlas ecosystem.

## Overview

Atlas has **4 different version numbers** that serve different purposes:

```
┌─────────────────────────────────────────────────────────────┐
│                    Atlas Core                                │
│  Version: 0.5.0                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Plugin Loader                                       │  │
│  │  - Loads plugins                                    │  │
│  │  - Implements context objects                        │  │
│  │  - Depends on SDK ^1.0.0                             │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ depends on
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              @mhingston5/atlas-plugin-sdk (npm package)                 │
│  Version: 1.0.0                                             │
│  API Version: 1.0  ◄── This is the contract                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Type definitions                                  │  │
│  │  - Manifest utilities                                │  │
│  │  - Helper functions                                  │  │
│  │  - Version constants                                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ depends on
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              My Atlas Plugin                                 │
│  Version: 2.1.0  ◄── Plugin's own version                   │
│  apiVersion: "1.0"  ◄── Which API it targets                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Workflows                                         │  │
│  │  - Sources                                           │  │
│  │  - Sinks                                             │  │
│  │  - Depends on SDK ^1.0.0                             │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## The Four Versions

### 1. SDK Version (npm package)

**Format:** SemVer (e.g., `1.0.0`, `1.1.0`, `2.0.0`)  
**Location:** `plugin-sdk/package.json`  
**Purpose:** Tracks changes to the SDK package itself

**When to bump:**
- **MAJOR** - Breaking changes to SDK utilities (rare, usually means API change too)
- **MINOR** - New utilities, helper functions, non-breaking additions
- **PATCH** - Bug fixes in utilities

**Example:**
```json
{
  "name": "@mhingston5/atlas-plugin-sdk",
  "version": "1.2.3"
}
```

### 2. API Version (contract)

**Format:** `MAJOR.MINOR` (e.g., `1.0`, `1.1`, `2.0`)  
**Location:** `plugin-sdk/src/types.ts` as `CURRENT_API_VERSION`  
**Purpose:** Defines the contract between plugins and core

**When to bump:**
- **MAJOR** - Breaking changes to types or interfaces
  - New required fields in PluginManifest
  - Changed WorkflowContext interface
  - Removed deprecated methods
- **MINOR** - New features, backward compatible
  - New optional fields in contexts
  - New plugin lifecycle hooks
  - Additional types (don't break existing)

**Example:**
```typescript
export const CURRENT_API_VERSION = "1.0";
```

**Checking compatibility:**
```typescript
// Major versions must match
plugin.apiVersion = "1.2";  // Plugin targets API v1.2
core.apiVersion = "1.5";    // Core supports API v1.5
// ✓ Compatible (same major, plugin minor <= core minor)

plugin.apiVersion = "2.0";  // Plugin targets API v2.0
core.apiVersion = "1.5";    // Core supports API v1.5
// ✗ Incompatible (different major)
```

### 3. Plugin Version (individual plugin)

**Format:** SemVer (e.g., `2.1.0`, `2.1.1`, `3.0.0`)  
**Location:** Plugin's `atlas.plugin.json` and `package.json`  
**Purpose:** Tracks changes to the specific plugin

**When to bump:**
- **MAJOR** - Breaking changes to plugin behavior
- **MINOR** - New features in plugin
- **PATCH** - Bug fixes

**Example:**
```json
{
  "id": "com.example.my-plugin",
  "version": "2.1.0",
  "apiVersion": "1.0"
}
```

### 4. Core Version

**Format:** SemVer (e.g., `0.5.0`, `0.6.0`, `1.0.0`)  
**Location:** `package.json`  
**Purpose:** Tracks changes to Atlas core

**When to bump:**
- **MAJOR** - Major architectural changes, breaking changes
- **MINOR** - New features in core
- **PATCH** - Bug fixes

## Version Compatibility Matrix

| SDK Version | API Version | Core Support | Notes |
|------------|-------------|--------------|-------|
| 1.0.0 | 1.0 | 0.5.0+ | Initial stable release |
| 1.1.0 | 1.1 | 0.6.0+ | Added new context methods |
| 1.2.0 | 1.1 | 0.6.0+ | New utility functions |
| 2.0.0 | 2.0 | 1.0.0+ | Breaking API changes |

## Dependency Rules

### SDK Dependencies

**Core** depends on SDK:
```json
{
  "dependencies": {
    "@mhingston5/atlas-plugin-sdk": "^1.0.0"
  }
}
```

**Plugins** depend on SDK:
```json
{
  "dependencies": {
    "@mhingston5/atlas-plugin-sdk": "^1.0.0"
  }
}
```

**Rule:** Use caret (`^`) to allow minor/patch updates but not major.

### API Version Compatibility

**At runtime**, Atlas checks:

```typescript
// Pseudocode
function checkCompatibility(pluginApiVersion: string, coreApiVersion: string) {
  const [pluginMajor, pluginMinor] = pluginApiVersion.split('.').map(Number);
  const [coreMajor, coreMinor] = coreApiVersion.split('.').map(Number);
  
  // Major versions MUST match
  if (pluginMajor !== coreMajor) {
    return { compatible: false, reason: 'Major version mismatch' };
  }
  
  // Plugin minor must be <= core minor
  if (pluginMinor > coreMinor) {
    return { compatible: false, reason: 'Plugin requires newer API features' };
  }
  
  return { compatible: true };
}
```

**Examples:**

| Plugin API | Core API | Compatible? | Reason |
|-----------|----------|-------------|---------|
| 1.0 | 1.0 | ✅ Yes | Exact match |
| 1.1 | 1.0 | ❌ No | Plugin needs v1.1 features |
| 1.0 | 1.1 | ✅ Yes | Core has extra features |
| 2.0 | 1.0 | ❌ No | Major version mismatch |
| 1.0 | 2.0 | ❌ No | Major version mismatch |

## Version Upgrade Scenarios

### Scenario 1: SDK Patch Release

**Change:** SDK 1.0.0 → 1.0.1 (bug fix in utilities)

**Impact:**
- Core: Can update without changes
- Plugins: Can update without changes
- API version: No change (still 1.0)

**Action:**
```bash
cd plugin-sdk
npm version patch  # 1.0.1
npm publish

# Core and plugins update:
npm update @mhingston5/atlas-plugin-sdk
```

### Scenario 2: SDK Minor Release

**Change:** SDK 1.0.0 → 1.1.0 (new utility functions)

**Impact:**
- Core: Can update without changes
- Plugins: Can update to use new utilities
- API version: No change (still 1.0)

**Action:**
```bash
cd plugin-sdk
npm version minor  # 1.1.0
npm publish

# Core updates:
npm update @mhingston5/atlas-plugin-sdk

# Plugins can optionally update:
npm update @mhingston5/atlas-plugin-sdk
# Use new utilities if desired
```

### Scenario 3: API Minor Update

**Change:** API 1.0 → 1.1 (new optional context methods)

**Impact:**
- Core: Must implement new methods
- Plugins: Can use new methods (optional)
- SDK: Minor version bump

**Action:**
```typescript
// SDK: Update API version
export const CURRENT_API_VERSION = "1.1";

// Add new types (optional fields don't break existing)
export interface WorkflowContext {
  // ... existing methods
  newMethod?(): Promise<void>;  // Optional, backward compatible
}
```

```bash
cd plugin-sdk
npm version minor  # 1.2.0 (new API version 1.1)
npm publish

# Core: Update to support new API
npm update @mhingston5/atlas-plugin-sdk
# Implement new context methods

# Plugins: Can update to use new features
# Or stay on old SDK version (still works)
```

### Scenario 4: API Major Update

**Change:** API 1.0 → 2.0 (breaking changes)

**Impact:**
- Core: Must update to support new API
- Plugins: Must update to work with new API
- SDK: Major version bump

**Action:**
```typescript
// SDK v2.0.0
export const CURRENT_API_VERSION = "2.0";

// Breaking changes:
export interface PluginManifest {
  // New required field
  newField: string;  
}
```

```bash
cd plugin-sdk
npm version major  # 2.0.0 (new API version 2.0)
npm publish

# Core: Major update required
# Update package.json: "@mhingston5/atlas-plugin-sdk": "^2.0.0"
npm install
# Update core code for new API

# Plugins: Must update
# Update package.json: "@mhingston5/atlas-plugin-sdk": "^2.0.0"
npm install
# Update plugin code for new API
```

### Scenario 5: Plugin Update

**Change:** Plugin 1.0.0 → 1.1.0 (new feature)

**Impact:**
- Plugin's own version changes
- API version stays the same
- SDK version stays the same

**Action:**
```bash
cd my-plugin
npm version minor  # 1.1.0
npm publish

# Update atlas.plugin.json
{
  "version": "1.1.0"
  // apiVersion unchanged
}
```

## Best Practices

### For Core Maintainers

1. **Never break API in minor/patch releases**
   - API 1.0 → 1.1: Add features, don't remove
   - API 1.0 → 2.0: Breaking changes only in major

2. **Support multiple API versions** (optional)
   ```typescript
   // Core can support both API 1.x and 2.x
   if (plugin.apiVersion.startsWith('1.')) {
     // Use v1 context
   } else if (plugin.apiVersion.startsWith('2.')) {
     // Use v2 context
   }
   ```

3. **Document API changes**
   - Keep CHANGELOG.md in SDK
   - Document breaking changes
   - Provide migration guides

### For Plugin Authors

1. **Use caret (^) for SDK dependency**
   ```json
   "@mhingston5/atlas-plugin-sdk": "^1.0.0"
   ```

2. **Test against minimum supported core version**
   ```json
   {
     "minCoreVersion": "0.5.0",
     "apiVersion": "1.0"
   }
   ```

3. **Document your plugin's requirements**
   ```markdown
   ## Requirements
   - Atlas Core: ^0.5.0
   - API Version: 1.0
   ```

### For Users

1. **Check compatibility before installing**
   ```bash
   atlas plugin check github:user/plugin
   ```

2. **Lock versions in production**
   ```json
   {
     "plugins": [
       {
         "id": "my-plugin",
         "source": "github:user/plugin#v1.2.3",
         "settings": {}
       }
     ]
   }
   ```

## Migration Guide: API 1.0 → 2.0 (Example)

### What Changed

- `WorkflowContext.emitArtifact()` → Changed signature
- `PluginManifest` → New required field `category`

### Steps

1. **Update SDK dependency**
   ```bash
   npm install @mhingston5/atlas-plugin-sdk@^2.0.0
   ```

2. **Update manifest**
   ```json
   {
     "apiVersion": "2.0",
     "category": "source"
   }
   ```

3. **Update code**
   ```typescript
   // Before (API 1.0)
   ctx.emitArtifact({
     type: 'my.result',
     data: {}
   });
   
   // After (API 2.0)
   ctx.emitArtifact({
     type: 'my.result',
     data: {},
     schema: 'my.result.v2'  // New required field
   });
   ```

4. **Test thoroughly**
5. **Update documentation**
6. **Publish new version**

## Version FAQ

**Q: Why separate SDK version from API version?**  
A: SDK can add utilities (patch/minor) without changing the core-plugin contract. API version only changes when the contract changes.

**Q: Can I use SDK 1.2 with API 1.0?**  
A: Yes! SDK minor updates don't change API version. You get new utilities but same contract.

**Q: What if core supports API 2.0 but I have API 1.0 plugins?**  
A: Core should ideally support both (backward compatibility) or plugins must upgrade.

**Q: How do I know which API version core supports?**  
A: Check `atlas status` or look at SDK dependency in core's package.json.

**Q: Can a plugin support multiple API versions?**  
A: Technically yes, but it's complex. Better to maintain separate branches for different API versions.

## Summary

| Version | Format | Purpose | Updated When |
|---------|--------|---------|--------------|
| **SDK** | SemVer | SDK package changes | SDK code changes |
| **API** | X.Y | Core-plugin contract | Type/interface changes |
| **Plugin** | SemVer | Plugin features | Plugin code changes |
| **Core** | SemVer | Core features | Core code changes |

**Remember:**
- SDK and API versions are independent
- Major API changes are breaking
- Use caret (^) for SDK dependencies
- Always document version requirements
