# Publishing

This repo currently ships as a local-first project and does **not** have an
official release pipeline. The steps below outline what is needed to publish
both the core package and the plugin SDK.

## Pre-flight Checklist

- Remove `"private": true` from the package you intend to publish.
- Confirm package names and versions in `package.json`.
- Run tests and formatting:
  ```bash
  bun test
  bun run check
  ```

## Core Package (@mhingston5/atlas)

Atlas currently runs from source (`src/index.ts`). For npm publishing you should
add a build step (for example `tsc`) and emit a `dist/` directory.

Suggested changes:

1. Add build + prepublish scripts in `package.json`.
2. Configure `tsconfig.json` to emit `dist/`.
3. Add `exports` and `main` fields to point to built output.

Example additions (illustrative):

```json
{
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "bun run build"
  }
}
```

Publish:

```bash
npm publish --access public
```

## Plugin SDK (@mhingston5/atlas-plugin-sdk)

The SDK already exists in `plugin-sdk/`, but it is not published yet.
You will need a build step and a publish step.

Suggested steps:

1. Add `build` + `prepublishOnly` scripts in `plugin-sdk/package.json`.
2. Add `main`, `types`, and `exports` pointing to `dist/`.
3. Run `npm publish` from inside `plugin-sdk/`.

Example additions (illustrative):

```json
{
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "bun run build"
  }
}
```

Publish:

```bash
cd plugin-sdk
npm publish --access public
```

## Suggested Next Step

Once the build outputs and exports are in place, add a CI release job (GitHub
Actions) to run tests + build and publish on tag.
