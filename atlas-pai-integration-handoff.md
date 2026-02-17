# Atlas PAI Integration: Feature Specification Handoff

**Date:** 2026-02-17  
**Status:** Ready for Implementation Review  
**Source:** Daniel Miessler's PAI v3.0 / TheAlgorithm v1.6.0  
**Target:** Atlas Personal AI Gateway  

---

## Executive Summary

This document proposes integration of Miessler's "Ideal State Criteria" (ISC) methodology and systematic hill-climbing patterns into Atlas. The goal is to enhance Atlas from a workflow/artifact system to a **goal-seeking system** with explicit quality criteria, mechanical verification, and systematic learning.

**Core Value Proposition:**
- Atlas produces artifacts → **Enhanced Atlas produces artifacts that provably meet criteria**
- Atlas tracks state → **Enhanced Atlas tracks intent and verification**
- Atlas chains workflows → **Enhanced Atlas hill-climbs toward ideal states**

---

## Background: Why This Matters

### Current State
Atlas has:
- ✅ Workflow orchestration with durable artifacts
- ✅ Plugin-based extensibility
- ✅ Single-writer correctness model
- ✅ Basic routing profiles (fast/balanced/quality)
- ⚠️ **Implicit quality criteria** (artifacts exist, but "good" is undefined)
- ⚠️ **No systematic verification** (emit and hope vs. verify and prove)
- ⚠️ **No learning loop** (workflows run, but don't improve)

### Target State
Atlas should:
- Define "good" explicitly for every artifact type (ISC)
- Verify artifacts meet criteria before emission (mechanical verification)
- Learn from every workflow execution (reflection mining)
- Persist intent alongside artifacts (PRD system)

---

## Feature 1: Ideal State Criteria (ISC) System

### Overview
ISC are discrete, boolean, testable statements that define "done" for artifacts. They serve dual purpose: planning criteria (what to build) and verification criteria (how to prove success).

### Implementation

#### 1.1 ISC Schema

```typescript
// src/types/isc.ts
export interface IdealStateCriterion {
  id: string;                    // e.g., "ISC-SUM-001"
  criterion: string;             // 8-12 words, state-based
  priority: 'CRITICAL' | 'IMPORTANT' | 'NICE';
  confidence: 'EXPLICIT' | 'INFERRED' | 'REVERSE_ENGINEERED';
  verify: VerificationMethod;
  domain?: string;               // For grouping (e.g., "accuracy", "completeness")
}

export interface AntiCriterion {
  id: string;                    // e.g., "ISC-A-SUM-001"
  criterion: string;             // What must NOT happen
  priority: 'CRITICAL' | 'IMPORTANT' | 'NICE';
  verify: VerificationMethod;
}

export type VerificationMethod = 
  | { type: 'CLI'; command: string }
  | { type: 'TEST'; testId: string }
  | { type: 'STATIC'; check: string }
  | { type: 'BROWSER'; scenario: string }
  | { type: 'GREP'; pattern: string }
  | { type: 'READ'; path: string }
  | { type: 'CUSTOM'; description: string };
```

#### 1.2 ISC Registry

```typescript
// src/isc/registry.ts
export class ISCRegistry {
  private criteria: Map<string, ISCDefinition> = new Map();
  
  register(artifactType: string, definition: ISCDefinition) {
    this.criteria.set(artifactType, definition);
  }
  
  getCriteria(artifactType: string): ISCDefinition | undefined {
    return this.criteria.get(artifactType);
  }
}

export interface ISCDefinition {
  artifactType: string;
  version: string;
  idealCriteria: IdealStateCriterion[];
  antiCriteria: AntiCriterion[];
  minCriteria: number;           // Usually 4
  scaleTier: 'SIMPLE' | 'MEDIUM' | 'LARGE' | 'MASSIVE';
}
```

#### 1.3 ISC for Existing Artifact Types

```typescript
// src/isc/definitions/summary.note.v1.ts
export const summaryNoteV1ISC: ISCDefinition = {
  artifactType: "summary.note.v1",
  version: "1.0.0",
  idealCriteria: [
    {
      id: "ISC-SUM-001",
      criterion: "Captures 3-5 key points from source material",
      priority: "CRITICAL",
      confidence: "EXPLICIT",
      verify: { type: "CUSTOM", description: "LLM evaluation vs source" },
      domain: "completeness"
    },
    {
      id: "ISC-SUM-002",
      criterion: "No factual claims without source attribution",
      priority: "CRITICAL",
      confidence: "EXPLICIT",
      verify: { type: "GREP", pattern: "\\[.*?\\]|\\(.*?\\)" },
      domain: "accuracy"
    },
    {
      id: "ISC-SUM-003",
      criterion: "Length between 100-300 words",
      priority: "IMPORTANT",
      confidence: "EXPLICIT",
      verify: { type: "CLI", command: "wc -w" },
      domain: "format"
    },
    {
      id: "ISC-SUM-004",
      criterion: "Tone matches source material intent",
      priority: "NICE",
      confidence: "INFERRED",
      verify: { type: "CUSTOM", description: "Sentiment analysis comparison" },
      domain: "style"
    }
  ],
  antiCriteria: [
    {
      id: "ISC-A-SUM-001",
      criterion: "No hallucinated facts not in source",
      priority: "CRITICAL",
      verify: { type: "CUSTOM", description: "Cross-reference with source entities" }
    },
    {
      id: "ISC-A-SUM-002",
      criterion: "No copy-paste from source exceeding 10 words",
      priority: "IMPORTANT",
      verify: { type: "CUSTOM", description: "Plagiarism detection" }
    }
  ],
  minCriteria: 4,
  scaleTier: "SIMPLE"
};
```

#### 1.4 ISC-Aware Workflow Context

```typescript
// Enhanced WorkflowContext
export interface WorkflowContext {
  // ... existing methods
  
  // ISC Integration
  getISC(artifactType: string): ISCDefinition | undefined;
  verifyCriterion(criterion: IdealStateCriterion, artifact: Artifact): Promise<VerificationResult>;
  verifyAllCriteria(artifactType: string, artifact: Artifact): Promise<ISCReport>;
}

export interface VerificationResult {
  criterionId: string;
  passed: boolean;
  evidence: string;
  actualValue?: string;
  thresholdValue?: string;
  durationMs: number;
}

export interface ISCReport {
  artifactId: string;
  passed: boolean;
  criteriaResults: VerificationResult[];
  antiCriteriaResults: VerificationResult[];
  summary: string;
  timestamp: string;
}
```

#### 1.5 Integration in Workflow Runtime

```typescript
// src/core/workflow-runner.ts (enhanced)
async function emitArtifact(ctx: WorkflowContext, artifact: Artifact) {
  // Get ISC for this artifact type
  const isc = ctx.getISC(artifact.type);
  
  if (isc) {
    // Verify against ISC before emission
    const report = await ctx.verifyAllCriteria(artifact.type, artifact);
    
    // Attach ISC report to artifact metadata
    artifact.data.isc_report = report;
    
    // Fail-closed: Don't emit if CRITICAL criteria fail
    const criticalFailures = report.criteriaResults.filter(
      r => !r.passed && isc.idealCriteria.find(c => c.id === r.criterionId)?.priority === 'CRITICAL'
    );
    
    if (criticalFailures.length > 0) {
      throw new Error(
        `Artifact failed ${criticalFailures.length} CRITICAL ISC criteria: ` +
        criticalFailures.map(f => f.criterionId).join(', ')
      );
    }
  }
  
  // Emit artifact with ISC report attached
  ctx.commandQueue.enqueue({
    type: "artifact.create",
    artifact: { ...artifact, verified: true }
  });
}
```

### Acceptance Criteria
- [ ] ISC schema defined and validated
- [ ] ISC registry can load definitions for artifact types
- [ ] Workflows can access ISC via context
- [ ] Pre-emission verification runs for ISC-enabled artifact types
- [ ] CRITICAL criterion failures block artifact emission (fail-closed)
- [ ] ISC reports stored in artifact metadata

---

## Feature 2: Verification Engine

### Overview
Mechanical verification of ISC criteria using multiple methods (CLI, Grep, Custom LLM eval, etc.)

### Implementation

#### 2.1 Verification Engine Architecture

```typescript
// src/verification/engine.ts
export class VerificationEngine {
  private verifiers: Map<string, Verifier> = new Map();
  
  constructor(
    private llmRouter: LLMRouter,
    private repo: ReadOnlyRepo
  ) {
    // Register built-in verifiers
    this.registerVerifier('CLI', new CLIVerifier());
    this.registerVerifier('GREP', new GrepVerifier());
    this.registerVerifier('READ', new ReadVerifier());
    this.registerVerifier('CUSTOM', new CustomVerifier(llmRouter));
  }
  
  async verify(
    method: VerificationMethod,
    artifact: Artifact,
    context?: Record<string, unknown>
  ): Promise<VerificationResult> {
    const verifier = this.verifiers.get(method.type);
    if (!verifier) {
      throw new Error(`Unknown verification method: ${method.type}`);
    }
    return verifier.verify(method, artifact, context);
  }
}

interface Verifier {
  verify(
    method: VerificationMethod,
    artifact: Artifact,
    context?: Record<string, unknown>
  ): Promise<VerificationResult>;
}
```

#### 2.2 Built-in Verifiers

```typescript
// src/verification/verifiers/cli.ts
class CLIVerifier implements Verifier {
  async verify(method: Extract<VerificationMethod, { type: 'CLI' }>, artifact: Artifact): Promise<VerificationResult> {
    const startTime = Date.now();
    
    try {
      // Run command with artifact content as stdin or env
      const proc = Bun.spawn(['sh', '-c', method.command], {
        stdin: artifact.content_md ? new TextEncoder().encode(artifact.content_md) : undefined,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      
      return {
        criterionId: '', // Set by caller
        passed: exitCode === 0,
        evidence: stdout.trim() || stderr.trim() || `Exit code: ${exitCode}`,
        actualValue: stdout.trim(),
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        criterionId: '',
        passed: false,
        evidence: `Error: ${error.message}`,
        durationMs: Date.now() - startTime,
      };
    }
  }
}

// src/verification/verifiers/grep.ts
class GrepVerifier implements Verifier {
  async verify(method: Extract<VerificationMethod, { type: 'GREP' }>, artifact: Artifact): Promise<VerificationResult> {
    const startTime = Date.now();
    const content = artifact.content_md || '';
    const pattern = new RegExp(method.pattern);
    const matches = content.match(pattern);
    
    return {
      criterionId: '',
      passed: matches !== null && matches.length > 0,
      evidence: matches ? `Found ${matches.length} matches` : 'No matches found',
      actualValue: matches?.join(', ') || 'none',
      thresholdValue: method.pattern,
      durationMs: Date.now() - startTime,
    };
  }
}

// src/verification/verifiers/custom.ts
class CustomVerifier implements Verifier {
  constructor(private llmRouter: LLMRouter) {}
  
  async verify(
    method: Extract<VerificationMethod, { type: 'CUSTOM' }>,
    artifact: Artifact,
    context?: Record<string, unknown>
  ): Promise<VerificationResult> {
    const startTime = Date.now();
    
    // Use LLM to evaluate custom criteria
    const prompt = `
      Evaluate this criterion for the artifact below:
      Criterion: ${method.description}
      
      Artifact Content:
      ${artifact.content_md}
      
      Context:
      ${JSON.stringify(context, null, 2)}
      
      Respond in JSON format:
      {
        "passed": boolean,
        "evidence": "explanation of evaluation",
        "actualValue": "what was measured",
        "confidence": number (0-1)
      }
    `;
    
    const result = await this.llmRouter.generateText({ prompt, temperature: 0.1 });
    const evaluation = JSON.parse(result.text);
    
    return {
      criterionId: '',
      passed: evaluation.passed,
      evidence: evaluation.evidence,
      actualValue: evaluation.actualValue,
      durationMs: Date.now() - startTime,
    };
  }
}
```

#### 2.3 Verification Report Storage

```typescript
// New command type for ISC reports
export type ISCReportCommand = {
  type: "isc.report.create";
  report: ISCReport;
};

// Database schema addition
// Table: isc_reports
// - id: string (ULID)
// - artifact_id: string (foreign key)
// - artifact_type: string
// - passed: boolean
// - criteria_results: JSON
// - anti_criteria_results: JSON
// - summary: string
// - created_at: datetime
```

### Acceptance Criteria
- [ ] VerificationEngine can run multiple verifier types
- [ ] CLI verifier executes commands and captures exit codes
- [ ] Grep verifier performs pattern matching
- [ ] Read verifier checks file contents
- [ ] Custom verifier uses LLM for subjective evaluation
- [ ] All verifiers return structured evidence
- [ ] Verification reports persisted to database

---

## Feature 3: Effort Level System + Enhanced Routing

### Overview
Replace simple routing profiles with tiered effort levels that control ISC depth, verification thoroughness, and resource allocation.

### Implementation

#### 3.1 Effort Level Definitions

```typescript
// src/types/effort.ts
export type EffortLevel = 
  | 'INSTANT'      // <10s
  | 'FAST'         // <1min
  | 'STANDARD'     // <2min (default)
  | 'EXTENDED'     // <8min
  | 'ADVANCED'     // <16min
  | 'DEEP'         // <32min
  | 'COMPREHENSIVE'; // <120min

export interface EffortConfig {
  level: EffortLevel;
  budgetSeconds: number;
  iscMinCriteria: number;
  iscMaxCriteria: number;
  enablePlanMode: boolean;
  enableVerificationRehearsal: boolean;
  constraintExtraction: boolean;
  parallelVerifiers: number;
}

export const EFFORT_CONFIGS: Record<EffortLevel, EffortConfig> = {
  INSTANT: {
    level: 'INSTANT',
    budgetSeconds: 10,
    iscMinCriteria: 0,
    iscMaxCriteria: 4,
    enablePlanMode: false,
    enableVerificationRehearsal: false,
    constraintExtraction: false,
    parallelVerifiers: 1,
  },
  FAST: {
    level: 'FAST',
    budgetSeconds: 60,
    iscMinCriteria: 4,
    iscMaxCriteria: 8,
    enablePlanMode: false,
    enableVerificationRehearsal: false,
    constraintExtraction: false,
    parallelVerifiers: 2,
  },
  STANDARD: {
    level: 'STANDARD',
    budgetSeconds: 120,
    iscMinCriteria: 4,
    iscMaxCriteria: 16,
    enablePlanMode: false,
    enableVerificationRehearsal: false,
    constraintExtraction: true,
    parallelVerifiers: 4,
  },
  EXTENDED: {
    level: 'EXTENDED',
    budgetSeconds: 480,
    iscMinCriteria: 12,
    iscMaxCriteria: 40,
    enablePlanMode: true,
    enableVerificationRehearsal: true,
    constraintExtraction: true,
    parallelVerifiers: 8,
  },
  // ... etc
};
```

#### 3.2 Routing Profile Mapping

```json
// gateway.routing.json (enhanced)
{
  "profiles": {
    "instant": {
      "effortLevel": "INSTANT",
      "providers": ["mock"],
      "models": ["mock-fast"]
    },
    "fast": {
      "effortLevel": "FAST",
      "providers": ["openai"],
      "models": ["gpt-4o-mini"]
    },
    "balanced": {
      "effortLevel": "STANDARD",
      "providers": ["openai", "anthropic"],
      "models": ["gpt-4o", "claude-3-sonnet"]
    },
    "quality": {
      "effortLevel": "EXTENDED",
      "providers": ["anthropic"],
      "models": ["claude-3-opus"]
    },
    "deep": {
      "effortLevel": "DEEP",
      "providers": ["anthropic"],
      "models": ["claude-3-opus"]
    }
  }
}
```

#### 3.3 Budget Tracking

```typescript
// src/core/budget-tracker.ts
export class BudgetTracker {
  private startTime: number;
  private config: EffortConfig;
  
  constructor(private jobId: string, effortLevel: EffortLevel) {
    this.config = EFFORT_CONFIGS[effortLevel];
    this.startTime = Date.now();
  }
  
  getRemainingBudget(): number {
    const elapsed = Date.now() - this.startTime;
    return Math.max(0, this.config.budgetSeconds * 1000 - elapsed);
  }
  
  getElapsedPercent(): number {
    const elapsed = Date.now() - this.startTime;
    return (elapsed / (this.config.budgetSeconds * 1000)) * 100;
  }
  
  isOverBudget(): boolean {
    return this.getElapsedPercent() > 100;
  }
  
  shouldAutoCompress(): boolean {
    // Auto-compress if >150% over phase budget
    return this.getElapsedPercent() > 150;
  }
  
  // Log budget status for reflection
  logStatus(): void {
    logInfo(`Job ${this.jobId} budget: ${this.getElapsedPercent().toFixed(1)}% elapsed`);
  }
}
```

### Acceptance Criteria
- [ ] Effort level configs defined for all tiers
- [ ] Routing profiles map to effort levels
- [ ] Budget tracker monitors execution time
- [ ] Auto-compression triggers at 150% overage
- [ ] Budget status logged for reflection

---

## Feature 4: Reflection and Learning System

### Overview
Systematic Q1/Q2/Q3 reflection after every workflow execution, with storage and mining for algorithm improvements.

### Implementation

#### 4.1 Reflection Schema

```typescript
// src/types/reflection.ts
export interface AlgorithmReflection {
  id: string;                    // ULID
  jobId: string;
  workflowId: string;
  timestamp: string;
  
  // Context
  effortLevel: EffortLevel;
  artifactType: string;
  criteriaCount: number;
  criteriaPassed: number;
  criteriaFailed: number;
  withinBudget: boolean;
  elapsedPercent: number;
  
  // Sentiment (optional user feedback)
  impliedSentiment?: number;     // 1-10 scale
  userFeedback?: string;
  
  // Three-question reflection
  q1Self: string;                // "What would I do differently?"
  q2Workflow: string;            // "What would a smarter workflow do?"
  q3System: string;              // "What would a smarter Atlas do?"
  
  // Metadata
  iscReportId?: string;
  version: string;               // Atlas version
}
```

#### 4.2 Reflection Capture

```typescript
// src/core/reflection-capture.ts
export class ReflectionCapture {
  constructor(
    private commandQueue: CommandQueue,
    private repo: ReadOnlyRepo
  ) {}
  
  async capture(jobId: string, effortLevel: EffortLevel): Promise<void> {
    const job = await this.repo.getJob(jobId);
    const iscReport = await this.repo.getISCReportForJob(jobId);
    
    // Build reflection context
    const context = {
      jobId,
      workflowId: job.workflow_id,
      effortLevel,
      artifactType: job.input?.artifactType || 'unknown',
      criteriaCount: iscReport?.criteriaResults.length || 0,
      criteriaPassed: iscReport?.criteriaResults.filter(r => r.passed).length || 0,
      criteriaFailed: iscReport?.criteriaResults.filter(r => !r.passed).length || 0,
      withinBudget: job.duration_ms < EFFORT_CONFIGS[effortLevel].budgetSeconds * 1000,
    };
    
    // Use LLM to generate reflection (or capture from workflow if provided)
    const reflection = await this.generateReflection(context);
    
    // Store reflection
    this.commandQueue.enqueue({
      type: "reflection.create",
      reflection
    });
  }
  
  private async generateReflection(ctx: Record<string, unknown>): Promise<AlgorithmReflection> {
    // This can be done via LLM or captured from workflow output
    // For now, placeholder - workflows can emit reflection artifacts
    return {
      id: generateULID(),
      jobId: ctx.jobId as string,
      workflowId: ctx.workflowId as string,
      timestamp: new Date().toISOString(),
      effortLevel: ctx.effortLevel as EffortLevel,
      artifactType: ctx.artifactType as string,
      criteriaCount: ctx.criteriaCount as number,
      criteriaPassed: ctx.criteriaPassed as number,
      criteriaFailed: ctx.criteriaFailed as number,
      withinBudget: ctx.withinBudget as boolean,
      elapsedPercent: 0, // Calculate from job
      q1Self: "Captured from workflow or generated",
      q2Workflow: "Captured from workflow or generated",
      q3System: "Captured from workflow or generated",
      version: process.env.ATLAS_VERSION || 'unknown',
    };
  }
}
```

#### 4.3 Reflection Storage

```typescript
// New command type
export type ReflectionCommand = {
  type: "reflection.create";
  reflection: AlgorithmReflection;
};

// Database schema
// Table: reflections
// - id: string (ULID)
// - job_id: string
// - workflow_id: string
// - timestamp: datetime
// - effort_level: string
// - artifact_type: string
// - criteria_count: int
// - criteria_passed: int
// - criteria_failed: int
// - within_budget: boolean
// - elapsed_percent: float
// - implied_sentiment: int (nullable)
// - q1_self: text
// - q2_workflow: text
// - q3_system: text
// - metadata: JSON
```

#### 4.4 Reflection Mining (Future)

```typescript
// src/reflection/miner.ts (stub for future)
export class ReflectionMiner {
  constructor(private repo: ReadOnlyRepo) {}
  
  async minePatterns(options: {
    workflowId?: string;
    artifactType?: string;
    since?: Date;
    minSentiment?: number;
  }): Promise<MinedPattern[]> {
    // Query reflections
    const reflections = await this.repo.queryReflections(options);
    
    // Cluster by themes
    // Identify recurring issues
    // Weight by signal strength (low sentiment + over-budget = high priority)
    
    return []; // Placeholder
  }
}

export interface MinedPattern {
  theme: string;
  frequency: number;
  avgSentiment: number;
  overBudgetRate: number;
  suggestedFix: string;
  affectedWorkflows: string[];
}
```

### Acceptance Criteria
- [ ] Reflection schema defined
- [ ] Reflection captured after workflow execution
- [ ] Reflections stored in database
- [ ] Reflection context includes ISC results
- [ ] ReflectionMiner stub for future clustering

---

## Feature 5: Persistent Requirements Documents (PRDs)

### Overview
Store intent and criteria alongside artifacts for traceability and multi-session work.

### Implementation

#### 5.1 PRD Schema

```typescript
// src/types/prd.ts
export interface PRD {
  id: string;                    // PRD-{YYYYMMDD}-{slug}
  artifactId: string;            // Link to artifact
  workflowId: string;
  jobId: string;
  
  // Status
  status: PRDStatus;
  effortLevel: EffortLevel;
  
  // Content
  title: string;
  problemSpace: string;
  keyFiles: string[];
  constraints: string[];
  decisions: PRDDecision[];
  
  // ISC
  idealCriteria: IdealStateCriterion[];
  antiCriteria: AntiCriterion[];
  
  // Progress
  iteration: number;
  maxIterations: number;
  lastPhase: string;
  failingCriteria: string[];
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  
  // Log
  log: PRDLogEntry[];
}

export type PRDStatus = 
  | 'DRAFT'
  | 'CRITERIA_DEFINED'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'VERIFYING'
  | 'COMPLETE'
  | 'FAILED'
  | 'BLOCKED';

export interface PRDDecision {
  date: string;
  decision: string;
  rationale: string;
  alternatives: string[];
}

export interface PRDLogEntry {
  iteration: number;
  date: string;
  phase: string;
  criteriaProgress: string;      // "X/Y"
  workDone: string;
  failing: string[];
  context: string;
}
```

#### 5.2 PRD Storage

```typescript
// New command type
export type PRDCommand = 
  | { type: "prd.create"; prd: PRD }
  | { type: "prd.update"; id: string; patch: Partial<PRD> }
  | { type: "prd.addLogEntry"; id: string; entry: PRDLogEntry };

// Storage options:
// Option A: Database table
// Table: prds (columns matching PRD interface)

// Option B: File system
// Location: ${ATLAS_DB_PATH}/../prds/{artifactId}.md
// Format: Markdown with YAML frontmatter
```

#### 5.3 PRD Markdown Format

```markdown
---
prd: true
id: PRD-20260217-summary-weekly
artifact_id: art-abc123
workflow_id: digest.weekly.v1
job_id: job-def456
status: COMPLETE
effort_level: STANDARD
created: 2026-02-17
updated: 2026-02-17
iteration: 1
max_iterations: 10
---

# Weekly Digest: Feb 10-16

## Problem Space
Synthesize weekly activity into digestible summary covering all source types.

## Key Files
- sources/notes/
- sources/bookmarks/
- sources/slack/

## Constraints
- Must cover all 7 days
- Exclude personal/private content
- Max 500 words

## Decisions

### 2026-02-17: Excluded Twitter from digest
- **Decision:** Omit Twitter mentions from weekly digest
- **Rationale:** Too high volume, low signal
- **Alternatives:** Include only liked tweets, include only threads

## Ideal State Criteria

### Completeness
- [x] ISC-COMP-001: Covers all 7 days in period | Verify: Grep: date mentions
- [x] ISC-COMP-002: Includes 3+ significant items per day | Verify: Custom

### Quality
- [x] ISC-QUAL-001: No copy-paste from sources >10 words | Verify: Custom
- [x] ISC-QUAL-002: Each item has source attribution | Verify: Grep: URLs/links

## Anti-Criteria
- [x] ISC-A-001: No personal information exposed | Verify: Custom

## LOG

### Iteration 1 — 2026-02-17
- Phase: VERIFY → COMPLETE
- Criteria: 4/4 passing
- Work: Generated digest, verified all criteria
- Failing: none
```

### Acceptance Criteria
- [ ] PRD schema defined
- [ ] PRD can be created for any artifact
- [ ] PRD status tracks through lifecycle
- [ ] PRD log captures iteration history
- [ ] PRD stored in database or filesystem
- [ ] PRD accessible via API for review

---

## Feature 6: Enhanced Workflows

### 6.1 ISC-Aware Workflow Templates

```typescript
// src/plugins/workflows/summary.note.v2.ts (ISC-aware version)
export const summaryNoteV2: WorkflowPlugin = {
  id: "summary.note.v2",
  
  isc: summaryNoteV1ISC,  // Link to ISC definition
  
  async run(ctx, input, jobId) {
    const { topic, sources } = input as SummaryInput;
    
    // 1. Get effort level from routing profile
    const effortLevel = ctx.getEffortLevel();
    const effortConfig = EFFORT_CONFIGS[effortLevel];
    
    // 2. Generate ISC (or use predefined)
    let criteria = ctx.getISC("summary.note.v2")?.idealCriteria || [];
    
    // 3. Reverse engineering + constraint extraction (if Extended+)
    if (effortConfig.constraintExtraction) {
      const constraints = await extractConstraints(ctx.llm, sources);
      criteria = enhanceCriteriaWithConstraints(criteria, constraints);
    }
    
    // 4. Generate summary
    const summary = await ctx.llm.generateText({
      prompt: buildSummaryPrompt(topic, sources, criteria),
      temperature: 0.3,
      profile: mapEffortToProfile(effortLevel),
    });
    
    // 5. Build artifact
    const artifact: Artifact = {
      type: "summary.note.v2",
      job_id: jobId,
      title: `Summary: ${topic}`,
      content_md: summary.text,
      data: {
        schema_version: "2",
        sources,
        criteria: criteria.map(c => c.id),
      },
    };
    
    // 6. Verify (emission will fail if CRITICAL criteria fail)
    await ctx.emitArtifact(artifact);
    
    // 7. Create PRD
    const prd: PRD = {
      id: generatePRDId("summary", topic),
      artifactId: artifact.id,
      workflowId: this.id,
      jobId,
      status: 'COMPLETE',
      effortLevel,
      title: artifact.title,
      problemSpace: `Summarize ${topic}`,
      idealCriteria: criteria,
      // ... etc
    };
    
    ctx.commandQueue.enqueue({ type: "prd.create", prd });
    
    // 8. Reflection (Standard+)
    if (effortLevel !== 'INSTANT' && effortLevel !== 'FAST') {
      await ctx.captureReflection(jobId, effortLevel);
    }
  },
};
```

### 6.2 Loop Mode for Curation Workflows

```typescript
// src/plugins/workflows/curate.loop.v1.ts
export const curateLoopV1: WorkflowPlugin = {
  id: "curate.loop.v1",
  
  async run(ctx, input, jobId) {
    const { artifactType, maxIterations = 10, agents = 4 } = input as LoopInput;
    
    // 1. Find artifacts needing curation
    const artifacts = await ctx.findArtifacts({
      type: artifactType,
      limit: 100,
      // Filter for unverified or failed ISC
    });
    
    // 2. Create PRD for loop
    const prd = createLoopPRD(artifactType, artifacts.length);
    
    // 3. Loop until all pass or max iterations
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      prd.iteration = iteration;
      
      // Find failing artifacts
      const failing = artifacts.filter(a => !a.data.isc_report?.passed);
      if (failing.length === 0) {
        prd.status = 'COMPLETE';
        break;
      }
      
      // Partition across agents
      const batches = partition(failing, Math.ceil(failing.length / agents));
      
      // Spawn parallel curation jobs
      const jobs = batches.map((batch, i) => 
        ctx.spawnJob("curate.batch.v1", {
          artifacts: batch.map(a => a.id),
          agentId: i,
          prdId: prd.id,
        })
      );
      
      // Wait for all
      await Promise.all(jobs);
      
      // Log progress
      prd.log.push({
        iteration,
        date: new Date().toISOString(),
        phase: 'EXECUTE',
        criteriaProgress: `${failing.length - batches.flat().length}/${failing.length}`,
        workDone: `Curated ${batches.flat().length} artifacts`,
        failing: failing.map(a => a.id),
        context: `Iteration ${iteration} complete`,
      });
      
      // Effort decay
      if (iteration > 3 && prd.effortLevel === 'EXTENDED') {
        prd.effortLevel = 'STANDARD';
      }
    }
    
    if (prd.status !== 'COMPLETE') {
      prd.status = 'FAILED';
    }
    
    ctx.commandQueue.enqueue({ type: "prd.update", id: prd.id, patch: prd });
  },
};
```

### 6.3 Builder-Validator Pair Workflow

```typescript
// src/plugins/workflows/paired.validation.v1.ts
export const pairedValidationV1: WorkflowPlugin = {
  id: "paired.validation.v1",
  
  async run(ctx, input, jobId) {
    const { task, isc, builderConfig, validatorConfig } = input as PairedInput;
    
    // 1. Builder creates artifact
    const builderJob = await ctx.spawnJob("builder.generic.v1", {
      task,
      isc,
      config: builderConfig,
    });
    
    // Wait for builder
    const builderResult = await ctx.waitForJob(builderJob);
    const artifact = builderResult.artifact;
    
    // 2. Validator independently verifies
    const validatorJob = await ctx.spawnJob("validator.generic.v1", {
      artifact: artifact.id,
      isc,
      config: validatorConfig,
    });
    
    const validationResult = await ctx.waitForJob(validatorJob);
    
    // 3. Only emit if validator approves
    if (validationResult.approved) {
      await ctx.emitArtifact(artifact);
    } else {
      // Reject and log
      ctx.emitArtifact({
        type: "rejection.notice.v1",
        title: "Artifact Rejected",
        content_md: `Builder artifact failed validation: ${validationResult.reason}`,
        data: {
          originalArtifact: artifact.id,
          failures: validationResult.failures,
        },
      });
    }
  },
};
```

---

## Database Schema Additions

```sql
-- ISC Reports
CREATE TABLE isc_reports (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  criteria_results JSON NOT NULL,
  anti_criteria_results JSON NOT NULL,
  summary TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
);

-- Reflections
CREATE TABLE reflections (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  effort_level TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  criteria_count INTEGER NOT NULL,
  criteria_passed INTEGER NOT NULL,
  criteria_failed INTEGER NOT NULL,
  within_budget BOOLEAN NOT NULL,
  elapsed_percent REAL NOT NULL,
  implied_sentiment INTEGER,
  q1_self TEXT NOT NULL,
  q2_workflow TEXT NOT NULL,
  q3_system TEXT NOT NULL,
  version TEXT NOT NULL,
  isc_report_id TEXT,
  metadata JSON,
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (isc_report_id) REFERENCES isc_reports(id)
);

-- PRDs
CREATE TABLE prds (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL,
  effort_level TEXT NOT NULL,
  title TEXT NOT NULL,
  problem_space TEXT,
  key_files JSON,
  constraints JSON,
  decisions JSON,
  ideal_criteria JSON NOT NULL,
  anti_criteria JSON NOT NULL,
  iteration INTEGER DEFAULT 0,
  max_iterations INTEGER DEFAULT 10,
  last_phase TEXT,
  failing_criteria JSON,
  log JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id),
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

-- Indexes
CREATE INDEX idx_isc_reports_artifact ON isc_reports(artifact_id);
CREATE INDEX idx_reflections_workflow ON reflections(workflow_id);
CREATE INDEX idx_reflections_timestamp ON reflections(timestamp);
CREATE INDEX idx_prds_artifact ON prds(artifact_id);
CREATE INDEX idx_prds_status ON prds(status);
```

---

## Implementation Phases

### Phase 1: Core ISC System (Week 1-2)
- Define ISC schema and registry
- Implement verification engine with CLI/Grep/Read verifiers
- Add ISC-aware artifact emission
- Create ISC definitions for 3-5 major artifact types
- **Success Criteria:** Workflows can emit ISC-verified artifacts

### Phase 2: Enhanced Routing + Budget Tracking (Week 2-3)
- Implement effort level configs
- Map routing profiles to effort levels
- Add BudgetTracker to workflow runtime
- Auto-compression at 150% overage
- **Success Criteria:** Budget tracking visible in logs

### Phase 3: Reflection System (Week 3-4)
- Create reflection schema and storage
- Capture reflection after workflow execution
- Store Q1/Q2/Q3 responses
- **Success Criteria:** Reflections queryable by workflow/artifact type

### Phase 4: PRD System (Week 4-5)
- Implement PRD schema and storage
- Create PRD on artifact emission
- Track PRD status progression
- Markdown export for review
- **Success Criteria:** PRDs accessible via API, show iteration history

### Phase 5: Advanced Workflows (Week 5-6)
- Loop mode for parallel curation
- Builder-Validator pair pattern
- Enhanced summary/note workflows with ISC
- **Success Criteria:** Loop mode processes 100 artifacts with parallel agents

### Phase 6: Integration + Polish (Week 6-8)
- Reflection mining (basic clustering)
- Documentation
- Migration from v1 workflows
- Performance optimization
- **Success Criteria:** All existing workflows can opt-in to ISC

---

## API Additions

```typescript
// GET /api/v1/artifacts/:id/isc-report
// Returns ISC verification report for artifact

// GET /api/v1/artifacts/:id/prd
// Returns PRD for artifact

// GET /api/v1/reflections?workflow_id=X&since=Y
// Query reflections with filtering

// GET /api/v1/workflows/:id/isc
// Get ISC definition for workflow

// POST /api/v1/jobs
// Enhanced to accept effort_level override in input
{
  "workflow_id": "summary.note.v2",
  "input": {
    "topic": "AI safety",
    "effort_level": "EXTENDED"  // Override routing profile
  }
}
```

---

## Migration Path

### Existing Workflows
Existing workflows continue to work unchanged. ISC is opt-in:

```typescript
// Add ISC to existing workflow
export const existingWorkflow: WorkflowPlugin = {
  id: "existing.workflow.v1",
  isc: existingWorkflowISC,  // Add this
  async run(ctx, input, jobId) {
    // Existing code unchanged
    // ISC verification happens automatically on emitArtifact
  },
};
```

### Gradual Adoption
1. Start with new artifact types using ISC
2. Gradually add ISC to high-value existing types
3. Use PRDs for complex multi-session work
4. Enable reflection for all Standard+ workflows

---

## Success Metrics

- **Quality:** % of artifacts passing all CRITICAL ISC criteria
- **Traceability:** % of artifacts with associated PRDs
- **Learning:** Number of reflection patterns mined per month
- **Efficiency:** Average time to meet ISC criteria by effort level
- **Adoption:** % of workflows with ISC definitions

---

## Questions for Implementation

1. **Storage:** Store PRDs as database rows or markdown files on disk?
2. **Custom Verification:** Use LLM for custom verifiers or pluggable external validators?
3. **Reflection Generation:** Capture from workflow output or generate via LLM?
4. **Migration:** Auto-migrate existing artifacts or start fresh?
5. **Performance:** Parallel verification for multiple criteria or sequential?

---

## References

- [PAI v3.0 README](https://raw.githubusercontent.com/danielmiessler/Personal_AI_Infrastructure/main/Releases/v3.0/README.md)
- [TheAlgorithm v1.6.0](https://raw.githubusercontent.com/danielmiessler/TheAlgorithm/main/versions/TheAlgorithm_Latest.md)
- [Generalized Hill-Climbing Article](https://danielmiessler.com/blog/nobody-is-talking-about-generalized-hill-climbing)
- Atlas ARCHITECTURE.md (current)
- Atlas workflow-authoring.md (current)

---

**Document Status:** Ready for review  
**Next Steps:** Review and prioritize features for Phase 1 implementation
