# Atlas Gateway Architecture

**A personal AI assistant gateway with strict single-writer concurrency and plugin-based extensibility.**

---

## Design Philosophy

Atlas prioritizes:
1. **Local-first operation** — No mandatory cloud dependencies
2. **Correctness over performance** — Single-writer model eliminates race conditions
3. **Clear boundaries** — Read-only vs write paths are explicit and enforced
4. **Plugin extensibility** — Core is minimal; features live in plugins
5. **Fail-safe defaults** — Mock LLM provider, graceful degradation

---

## Core Invariants

### 1. Single-Writer Model

**Invariant**: Only one component — the `FlushLoop` — writes to the database.

**Enforcement**:
- `Writer` class is instantiated once and passed to `FlushLoop`
- All mutations represented as `Command` objects
- All components enqueue to `CommandQueue`; none call `writer.applyBatch()` directly
- FlushLoop drains queue on ~100ms interval and applies batches transactionally

**Rationale**: 
- Eliminates concurrency bugs (no locks, no races)
- Makes data flow auditable (all writes flow through queue)
- Simplifies testing (deterministic command replay)

**Code paths verified**:
```
runner.ts       → commands.enqueue()  ✓
api/server.ts   → commands.enqueue()  ✓
plugins/*       → commands.enqueue()  ✓
loop.ts         → writer.applyBatch() ✓ (ONLY caller)
```

### 2. Command Completeness

**Invariant**: All state mutations have corresponding command types.

**Current command types** (9 total):
```typescript
| { type: "entity.upsert"; entity: Entity }
| { type: "event.insert"; event: Event }
| { type: "artifact.create"; artifact: NewArtifact }
| { type: "artifact.update"; id: string; patch: PartialArtifact }
| { type: "job.create"; job: NewJob }
| { type: "job.updateStatus"; id: string; status: JobStatus }
| { type: "domainEvent.emit"; event: DomainEvent }
| { type: "domainEvent.markDelivered"; id: string }
| { type: "maintenance.prune"; policy: PrunePolicy }
```

All 9 types implemented in `apply.ts` with transactional semantics.

### 3. Read/Write Separation

**Read path**: 
- `ReadOnlyRepo` exposes query methods
- Takes `Database` handle but never mutates
- Used by: API handlers, job runner, plugins

**Write path**:
- `CommandQueue` → `FlushLoop` → `Writer` → `applyCommand()`
- Transactional batches via SQLite transaction API
- Domain events emitted inside transactions

**Contract**: Workflows receive `ReadOnlyRepo` and `CommandQueue`, never `Writer`.

### Routing System

Atlas uses a **profile-based routing system** to select LLM providers and harness executors at runtime.

```
┌────────────────────────────────────────────────┐
│        gateway.routing.json                    │
│  - Profile definitions (fast/balanced/quality) │
│  - Provider/harness priority lists             │
│  - Harness command configurations              │
└────────────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌──────────────┐          ┌──────────────┐
│  LLMRouter   │          │HarnessRouter │
│  (select     │          │  (select     │
│   provider)  │          │   harness)   │
└──────────────┘          └──────────────┘
        │                         │
        ▼                         ▼
┌──────────────┐          ┌──────────────┐
│ GatedLLM     │          │GatedHarness  │
│ Runtime      │          │  Runtime     │
└──────────────┘          └──────────────┘
```

**Routing logic**:
1. Workflow calls `ctx.llm.generateText({ profile: "quality", ... })`
2. Router looks up "quality" profile: `["openai", "anthropic-sonnet"]`
3. Attempts providers in order until one succeeds
4. Falls back to mock if all fail

**Benefits**:
- Zero-config development (mock fallback)
- Cost optimization (use cheap models for simple tasks)
- Reliability (automatic failover between providers)
- Environment-specific configs (dev/staging/prod)

---

## Component Architecture

### Database Layer

```
┌─────────────────────────────────────────────┐
│  db.ts: SQLite connection + migrations      │
│  - WAL mode enabled                         │
│  - Migration tracking (schema_migrations)   │
│  - Lexicographic ordering (001_, 002_, ...) │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌───────────────┐       ┌──────────────┐
│ ReadOnlyRepo  │       │    Writer    │
│ (queries)     │       │  (mutations) │
└───────────────┘       └──────────────┘
        │                       ▲
        │                       │
        │               ┌───────────────┐
        │               │  FlushLoop    │
        │               │  (100ms tick) │
        │               └───────────────┘
        │                       ▲
        │                       │
        └───────────────┬───────┘
                        │
                ┌───────────────┐
                │ CommandQueue  │
                │ (enqueue/     │
                │  drain)       │
                └───────────────┘
```

**Key decision**: `ReadOnlyRepo` and `Writer` both use the same SQLite connection, but:
- SQLite serializes concurrent writes (single-writer at DB level)
- Our architecture adds an additional constraint: only FlushLoop writes
- This makes reasoning about state transitions trivial (no interleaving)

### Plugin System

```
┌──────────────────────────────────────────────────┐
│              PluginRegistry                      │
│  - sources:   Map<id, SourcePlugin>              │
│  - workflows: Map<id, WorkflowPlugin>            │
│  - sinks:     Map<id, SinkPlugin>                │
└──────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Source    │  │  Workflow   │  │    Sink     │
│   Plugin    │  │   Plugin    │  │   Plugin    │
├─────────────┤  ├─────────────┤  ├─────────────┤
│ sync(ctx)   │  │ run(ctx,    │  │ handle(evt, │
│             │  │     input,  │  │        ctx) │
│             │  │     jobId)  │  │             │
└─────────────┘  └─────────────┘  └─────────────┘
```

**Plugin contracts**:

#### SourcePlugin
```typescript
sync(ctx: SourceContext): Promise<void>
```
- Polls external data source (GitHub, Raindrop, etc.)
- Enqueues `entity.upsert` and `event.insert` commands
- Error handling: fails gracefully, logs error, continues

#### WorkflowPlugin  
```typescript
run(ctx: WorkflowContext, input: Record<string, unknown>, jobId: string): Promise<void>
```
- Receives workflow-specific input
- Has access to `ctx.llm` (LLMProvider interface)
- Composition helpers: `ctx.emitArtifact()`, `ctx.spawnJob()`
- Error handling: exceptions caught by runner, job marked as failed

#### SinkPlugin
```typescript
handle(event: DomainEvent, ctx: SinkContext): Promise<void>
```
- Processes domain events (entity.upserted, job.succeeded, etc.)
- Examples: send webhook, update external system, log to console
- Must enqueue `domainEvent.markDelivered` to acknowledge processing

**Context isolation**:
- All contexts expose `ReadOnlyRepo` (queries only)
- All contexts expose `CommandQueue` (mutations only)
- WorkflowContext additionally exposes:
  - `LLMRuntime` (stateless text generation)
  - `HarnessRuntime` (optional agent/tool executor)
  - `findArtifacts()` (artifact query helper)

### Jobs Layer

```
┌──────────────┐    5s interval    ┌──────────────┐
│  Scheduler   │ ─────────────────▶│   Runner     │
│              │                    │  (runOnce)   │
└──────────────┘                    └──────────────┘
                                           │
                                           ▼
                                    ┌──────────────┐
                                    │  Workflow    │
                                    │  Execution   │
                                    └──────────────┘
                                           │
                                           ▼
                                    commands.enqueue(
                                      job.updateStatus,
                                      artifact.create,
                                      ...
                                    )
```

**Design decision**: Scheduler is interval-based, not event-driven.

**Rationale**:
- Simpler than distributed queue (RabbitMQ, Redis)
- Sufficient for single-instance MVP
- 5s latency acceptable for async workflows
- Future: could add priority queue or webhook triggers

**No leasing**: The runner assumes single gateway instance. For multi-instance:
- Add `SELECT ... WHERE status='queued' LIMIT 1 FOR UPDATE SKIP LOCKED`
- Or use Redis-based distributed lock
- Current design documented as intentional constraint

### AI Runtime Abstraction

```
┌──────────────────────────────────────────────┐
│           LLMRuntime interface               │
│  generateText(opts) → { text, usage }        │
└──────────────────────────────────────────────┘
                        │
                ┌───────┴────────┐
                ▼                ▼
        Skill-aware wrapper   (optional)
        (AGENTS.md + skills)
                │
        ┌───────────────┼───────────────┬───────────┐
        ▼               ▼               ▼           ▼
┌─────────────┐  ┌─────────────┐  ┌─────────┐  ┌─────────┐
│    Mock     │  │   OpenAI    │  │Anthropic│  │ Ollama  │
│  (default)  │  │   Adapter   │  │ Adapter │  │ Adapter │
└─────────────┘  └─────────────┘  └─────────┘  └─────────┘
                        │               │           │
                        └───────┬───────┴───────────┘
                                ▼
                        Vercel AI SDK
                        (implementation detail)
```

**Key principle**: Workflows depend on `LLMRuntime` interface, not SDK.

**Instruction injection**: When enabled, Atlas injects `AGENTS.md` and
selected skill content into the system prompt before LLM calls.

**Provider selection**: Profile-based routing via `gateway.routing.json`:
```json
{
  "llm": {
    "default_profile": "balanced",
    "profiles": {
      "fast": ["ollama", "openai-mini"],
      "balanced": ["openai-mini", "anthropic-haiku"],
      "quality": ["openai", "anthropic-sonnet"]
    },
    "fallback": ["mock"]
  }
}
```

Workflows request a profile ("fast", "balanced", "quality"), and the router selects the first available provider from that profile's list.

**Fallback behavior**: 
- If requested profile unavailable → try next profile
- If all profiles fail → use fallback (mock)
- Logged as warning

**Why this matters**:
- Onboarding works without API keys
- CI/testing doesn't need secrets
- Plugin authors can develop against stable interface
- Provider SDK churn doesn't break plugin API
- Cost/quality trade-offs configurable at runtime

---

## Data Flow Examples

### Example 1: Source Sync → Entity Creation

```
HTTP POST /sync
      │
      ▼
API handler calls source.sync(ctx)
      │
      ▼
Source enqueues: commands.enqueue({ type: "entity.upsert", entity: {...} })
      │
      ▼
FlushLoop (100ms later) drains queue
      │
      ▼
writer.applyBatch([...commands...])
      │
      ▼
applyCommand() inserts/updates row in `entities` table
      │
      ▼
emit() creates domain event: { type: "entity.upserted", aggregate_id: entity.id }
      │
      ▼
Domain event inserted in same transaction
      │
      ▼
Transaction commits
```

**Atomicity**: Entity + domain event written together or not at all.

### Example 2: Job Creation → Workflow Execution → Artifact

```
HTTP POST /jobs { workflow_id: "brainstorm.v1", input: {...} }
      │
      ▼
API enqueues: commands.enqueue({ type: "job.create", job: {...} })
    FlushLoop commits job to DB
      │
      ▼
Scheduler (5s interval) calls runner.runOnce()
      │
      ▼
Runner queries: repo.listJobs({ status: "queued" })
      │
      ▼
Runner enqueues: commands.enqueue({ type: "job.updateStatus", status: "running" })
      │
      ▼
Runner calls: await workflow.run(ctx, input, jobId)
      │
      ▼
Workflow calls: ctx.llm.generateText(prompt)
      │
      ▼
Workflow calls: ctx.emitArtifact({ type: "...", content_md: result.text })
      │ (this enqueues artifact.create command)
      ▼
Workflow returns (no throw)
      │
      ▼
Runner enqueues: commands.enqueue({ type: "job.updateStatus", status: "succeeded" })
      │
      ▼
FlushLoop commits all: artifact + job status update
```

**Timeline**: ~5s from job creation to execution start (scheduler interval).

### Example 3: Workflow Uses Harness for Code Changes

```
Workflow invokes: ctx.harness.runTask({ goal: "Add error handling", cwd: "./src" })
      │
      ▼
HarnessRouter selects harness from profile (e.g., "codex-cli")
      │
      ▼
GatedHarnessRuntime spawns subprocess: `copilot --goal "Add error handling" --cwd "./src"`
      │
      ▼
External tool (Codex CLI) executes, reads/writes files, produces diff
      │
      ▼
OutputParser extracts diff from stdout/file
      │
      ▼
Returns: { mode: "propose", summary: "...", outputs: [{ type: "diff", diff: "..." }] }
      │
      ▼
Workflow enqueues: ctx.emitArtifact({ type: "code.diff.v1", content_md: diff })
```

**Harness abstraction**: Allows workflows to delegate tool-using tasks (file I/O, shell commands) to specialized agents without hardcoding CLI interfaces.

---

## Extension Points

### Adding a New Workflow

1. **Create workflow file**: `src/plugins/workflows/my_workflow.ts`
2. **Implement WorkflowPlugin**:
   ```typescript
   export const myWorkflow: WorkflowPlugin = {
     id: "my-workflow.v1",
     async run(ctx, input, jobId) {
       // Query data
       const entities = ctx.repo.listEntities({ type: "..." });
       
       // Call LLM (with profile-based routing)
       const result = await ctx.llm.generateText({
         system: "...",
         prompt: "...",
         profile: "balanced", // or "fast" or "quality"
       });
       
       // Use harness for code changes (optional)
       if (ctx.harness) {
         const codeResult = await ctx.harness.runTask({
           goal: "Add error handling to main.ts",
           cwd: "./src",
           mode: "propose",
           profile: "quality",
         });
         // codeResult.outputs contains diffs, plans, or command logs
       }
       
       // Emit artifact
       ctx.emitArtifact({
         type: "my-workflow.output.v1",
         job_id: jobId,
         content_md: result.text,
         data: { schema_version: "1" },
       });
     }
   };
   ```
3. **Register**: `registry.registerWorkflow(myWorkflow)` in `src/index.ts`

**Constraints**:
- Workflows are stateless (no instance variables)
- All side effects via commands (no direct DB writes)
- Errors handled by runner (job marked failed, exception logged)

### Adding a New LLM Provider

1. **Create adapter**: `src/ai/providers/my_provider.ts`
2. **Implement LLMRuntime**:
   ```typescript
   export const myProvider: LLMRuntime = {
     async generateText(opts) {
       // ... call provider API ...
       return {
         text: response.text,
         usage: { inputTokens: ..., outputTokens: ... },
         provider: "my-provider",
         model: opts.model || "default-model",
       };
     }
   };
   ```
3. **Register**: Add to provider factory in `src/ai/provider_factory.ts`
4. **Configure**: Add to `gateway.routing.json`:
   ```json
   {
     "llm": {
       "profiles": {
         "fast": ["my-provider", "openai-mini"]
       }
     }
   }
   ```

**Contract**: Must return `{ text, provider, model?, usage? }`. Errors should throw (caught by workflow runner).

### Adding a New Harness

1. **Define harness config** in `gateway.routing.json`:
   ```json
   {
     "harnesses": {
       "my-tool": {
         "command": "my-cli-tool",
         "args_template": ["--task", "{goal}", "--dir", "{cwd}"],
         "output_parsers": {
           "diff": { "type": "stdout_all" }
         },
         "timeout_ms": 180000
       }
     }
   }
   ```
2. **Add to routing profiles**:
   ```json
   {
     "harness": {
       "profiles": {
         "quality": ["my-tool", "codex-cli", "noop"]
       }
     }
   }
   ```

**Output parsers**:
- `stdout_all`: Capture all stdout as text
- `stdout_section`: Extract text between markers
- `json_field`: Parse JSON output and extract field
- `file_glob`: Read files matching pattern
- `exit_code`: Return exit code as result

**Contract**: Harness must be an executable available in PATH. Supports standard output formats or custom parsers.

---

## Operational Characteristics

### Scalability Limits (Current Design)

| Dimension | Limit | Rationale |
|-----------|-------|-----------|
| Concurrent jobs | ~10/5s | Scheduler polls every 5s, runner fetches 10 jobs |
| Command throughput | ~1000/s | FlushLoop drains 100 cmds/100ms, SQLite handles easily |
| API requests | ~100 req/s | Bun.serve() is fast; bottleneck is job execution |
| Database size | ~100GB | SQLite supports; practical limit is disk I/O |

**Not designed for**:
- Multi-tenant workloads (single-user system)
- Real-time job execution (5s+ latency acceptable)
- Distributed deployment (assumes single instance)

### Failure Modes

#### FlushLoop crash mid-batch
- **Impact**: Commands in current batch lost (not yet committed)
- **Recovery**: No partial writes (transactions ensure atomicity)
- **Mitigation**: Could add command persistence before flush (overkill for MVP)

#### Workflow throws exception
- **Impact**: Job marked `failed`, error logged
- **Recovery**: Manual retry via new job or workflow fix + rerun
- **Mitigation**: Workflow author responsibility to handle retryable errors

#### Database corruption
- **Impact**: System inoperable
- **Recovery**: Restore from backup (WAL mode makes corruption unlikely)
- **Mitigation**: Periodic backups via `cp data/atlas.db backups/`

---

## Migration Strategy

### From Prototype to Production

**Current MVP assumptions**:
1. Single instance (no distributed leasing)
2. Interval-based scheduling (no event triggers)
3. In-memory command queue (lost on crash)
4. No authentication (trust all API callers)

**Path to production**:
1. **Add persistent queue** (Redis or DB-backed)
2. **Add job leasing** (FOR UPDATE SKIP LOCKED or Redis locks)
3. **Add API authentication** (API keys or OAuth)
4. **Add observability** (metrics, traces, structured logging)
5. **Add backup automation** (cron job for DB snapshots)

**Non-goals** (intentionally out of scope):
- Multi-user/multi-tenant support (local-first design)
- Horizontal scaling (single instance by design)
- Sub-second job latency (async workflows by nature)

---

## Comparison to Alternatives

### vs. Event Sourcing
Atlas uses **domain events for observability**, not as source of truth.

| Atlas | Event Sourcing |
|-------|----------------|
| State stored in tables | State derived from events |
| Commands applied directly | Commands → events → projections |
| Simpler (no rebuilds) | More flexible (time travel) |

**Trade-off**: We sacrifice replayability for simplicity. Acceptable for personal assistant use case.

### vs. Temporal/Durable Workflows
Atlas has **simple job runner**, not durable workflow engine.

| Atlas | Temporal |
|-------|----------|
| Workflows are functions | Workflows are state machines |
| No retries/saga support | Built-in compensation |
| No workflow versioning | Migration tools |

**Trade-off**: We sacrifice robustness for minimalism. Workflows are responsible for their own error handling.

---

## Summary of Verified Claims

✅ FlushLoop is sole caller of `writer.applyBatch()`  
✅ Runner/API/plugins only call `commands.enqueue()`  
✅ All 9 command types implemented in `apply.ts`  
✅ Plugin contracts (Source/Workflow/Sink) match code  
✅ Migration tracking uses `schema_migrations` table  
✅ Mock LLM runtime works without API keys  
✅ Profile-based routing provides automatic fallback  
✅ Harness abstraction decouples workflows from CLI tools  
✅ Graceful shutdown flushes remaining commands  

**Architectural coherence**: Verified via code inspection (2026-01-30).
