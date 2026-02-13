# Workflow Authoring Guide

This guide covers how to design, implement, and register workflows in Atlas.
Workflows are the primary unit of automation: they read data, call the LLM or
other services, and emit durable artifacts.

## When to Use a Workflow

Use a workflow when you need to:
- Transform entities into artifacts
- Synthesize or summarize existing artifacts
- Automate repetitive curation steps
- Call external APIs and produce a durable output

## Workflow Shape

A workflow is a `WorkflowPlugin` with a stable `id` and a `run()` method.

```ts
import type { WorkflowPlugin } from "../plugins/types";

export const myWorkflow: WorkflowPlugin = {
  id: "my.workflow.v1",

  async run(ctx, input, jobId) {
    // 1) Read inputs
    // 2) Call LLM / fetch data
    // 3) Emit artifacts
  },
};
```

## Inputs and Contracts

- Treat `input` as untrusted. Parse and validate defensively.
- Version your workflow id and artifact types (`.v1`, `.v2`) to allow changes.

```ts
type MyInput = {
  topic: string;
  limit?: number;
};

const payload = input as MyInput;
const topic = String(payload.topic ?? "").trim();
const limit = payload.limit ?? 10;
```

## LLM Calls

Use the shared LLM runtime so routing and tracing stay consistent.

```ts
const result = await ctx.llm.generateText({
  prompt: `Summarize: ${topic}`,
  temperature: 0.2,
  profile: "balanced",
});
```

## Emitting Artifacts

Artifacts are the durable outputs used by downstream workflows.

```ts
ctx.emitArtifact({
  type: "summary.note.v1",
  job_id: jobId,
  title: `Summary: ${topic}`,
  content_md: result.text,
  data: {
    schema_version: "1",
    produced_by: "my.workflow.v1",
    llm_provider: result.provider,
    llm_usage: result.usage,
  },
});
```

## Reading Data

Workflows can query artifacts and entities through the repo.

```ts
const recentNotes = ctx.findArtifacts({
  type: "note.v1",
  limit: 20,
});

const memoryFiles = ctx.repo.listEntities({
  type: "memory.file",
  source: "memory.source",
  limit: 50,
});
```

## Spawning Jobs

Use `ctx.spawnJob()` to chain workflows.

```ts
ctx.spawnJob("index.embeddings.v1", {
  owner_type: "artifact",
  limit: 200,
});
```

## Approvals and Checkpoints

For workflows that require explicit human review, emit approval artifacts or
use the approval-aware workflows already in core (e.g. `code.review.v1`).

```ts
ctx.emitArtifact({
  type: "checkpoint.approval_request.v1",
  job_id: jobId,
  title: "Approval Required: My Workflow",
  content_md: "Review this output and approve.",
  data: {
    schema_version: "1.0",
    produced_by: "my.workflow.v1",
  },
});
```

## Error Handling

- Log context using `logInfo` / `logError` from `core/logger`.
- Fail fast on missing inputs.

## Registering the Workflow

1) Create the workflow file in `src/plugins/workflows/`.
2) Register it in `src/index.ts`.

```ts
import { myWorkflow } from "./plugins/workflows/my_workflow";
registry.registerWorkflow(myWorkflow);
```

## Testing

- Use `bun test` to run workflow integration tests.
- Add targeted tests under `tests/plugins/` when behavior is non-trivial.

## Naming Conventions

- Workflow IDs: `domain.action.v1`
- Artifact types: `domain.output.v1`
- Keep ids stable and bump version for breaking changes
