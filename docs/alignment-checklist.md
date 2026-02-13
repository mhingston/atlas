# Atlas Alignment Checklist (January 2026)

Use this to validate the repository and product surface against the January 2026 “practical AI tooling” positioning.

## TRY — Must Be True

### 1) Personal agent loops with explicit control
- [ ] Harness workflows default to *propose* mode (no silent changes).
- [ ] Explicit approval checkpoints are supported and documented.
- [ ] Verifier hook exists and is enforced in the runner.
- [ ] Trace/timeline shows workflow + LLM + harness steps.
- [ ] Scratchpad review workflow provides a decision note + approval checkpoint (`scratchpad.review.v1`).

### 2) Local / hybrid LLM setups for thinking
- [ ] Local provider (Ollama) works end-to-end with docs.
- [ ] Profile routing supports cheap/local → frontier fallback.
- [ ] Mock provider enables local iteration without keys.

### 3) Code-first automation
- [ ] Workflows are code, not UI configs.
- [ ] Harnesses are config-driven and policy-gated.
- [ ] New workflow authoring is documented and fast.

### 4) Persistent second brain
- [ ] Artifacts are durable and queryable.
- [ ] Embeddings indexing exists and can be scheduled via cron/CLI/HTTP.
- [ ] Digest workflow synthesizes across time windows.
- [ ] Search endpoint supports semantic retrieval.

## WATCH — Acknowledge but Don’t Overpromise

- [ ] Fully autonomous agents are gated or explicitly not a goal.
- [ ] Multimodal (vision/audio/action) is not implied or marketed.
- [ ] AI-native productivity suite claims are avoided.

## IGNORE — Avoid by Design

- [ ] No opaque “set-and-forget” flows without inspection.
- [ ] No generic AI dashboards as the core value prop.
- [ ] No reliance on prompt marketplaces.

## Positioning Sanity Check

- [ ] Emphasize visible cognition, composability, and judgment amplification.
- [ ] Avoid “replace thinking” language; prefer “compress time-to-outcome.”
- [ ] Make tradeoffs explicit (safety, inspection, local-first).

## Current Gaps (Track to Close)

- [ ] Curation depth: conflict resolution policies + dedupe at scale.
- [ ] “Thinking loop” UX: scratchpad-style workflows for ideation and synthesis.
- [ ] Operator ergonomics: lightweight UI or CLI affordances for approvals + tracing.
