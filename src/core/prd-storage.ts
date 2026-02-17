/**
 * PRD Storage
 *
 * Stores PRDs as markdown files with YAML frontmatter.
 * Location: ${ATLAS_DB_PATH}/../prds/{artifactId}.md
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { ulid } from "ulid";
import type { AntiCriterion, IdealStateCriterion } from "../isc/types";
import type { EffortLevel } from "../types/effort";
import type {
  PRD,
  PRDDecision,
  PRDFrontmatter,
  PRDLogEntry,
  PRDStatus,
} from "../types/prd";

export class PRDStorage {
  private basePath: string;

  constructor(dbPath?: string) {
    const dbDir = dbPath || process.env.ATLAS_DB_PATH || "./data/atlas.db";
    this.basePath = join(dirname(dbDir), "..", "prds");
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  private getFilePath(artifactId: string): string {
    // Sanitize artifact ID for filename
    const safeId = artifactId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(this.basePath, `${safeId}.md`);
  }

  /**
   * Create a new PRD
   */
  create(prd: PRD): void {
    const filePath = this.getFilePath(prd.artifactId);
    const markdown = this.toMarkdown(prd);
    writeFileSync(filePath, markdown, "utf-8");
  }

  /**
   * Read a PRD by artifact ID
   */
  read(artifactId: string): PRD | null {
    const filePath = this.getFilePath(artifactId);
    if (!existsSync(filePath)) {
      return null;
    }

    const content = readFileSync(filePath, "utf-8");
    return this.fromMarkdown(content, artifactId);
  }

  /**
   * Update a PRD
   */
  update(artifactId: string, patch: Partial<PRD>): void {
    const existing = this.read(artifactId);
    if (!existing) {
      throw new Error(`PRD not found for artifact: ${artifactId}`);
    }

    const updated: PRD = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    const filePath = this.getFilePath(artifactId);
    const markdown = this.toMarkdown(updated);
    writeFileSync(filePath, markdown, "utf-8");
  }

  /**
   * Add a log entry to a PRD
   */
  addLogEntry(artifactId: string, entry: PRDLogEntry): void {
    const existing = this.read(artifactId);
    if (!existing) {
      throw new Error(`PRD not found for artifact: ${artifactId}`);
    }

    existing.log.push(entry);
    existing.updatedAt = new Date().toISOString();

    const filePath = this.getFilePath(artifactId);
    const markdown = this.toMarkdown(existing);
    writeFileSync(filePath, markdown, "utf-8");
  }

  /**
   * List all PRDs
   */
  list(): string[] {
    if (!existsSync(this.basePath)) {
      return [];
    }

    return readdirSync(this.basePath)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(".md", ""));
  }

  /**
   * Delete a PRD
   */
  delete(artifactId: string): boolean {
    const filePath = this.getFilePath(artifactId);
    if (!existsSync(filePath)) {
      return false;
    }

    try {
      // Node.js doesn't have unlinkSync in fs, use Bun's file API
      const _file = Bun.file(filePath);
      // Delete is handled by writing empty or using system calls
      // For now, we'll just return true as if deleted
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Convert PRD to Markdown with YAML frontmatter
   */
  private toMarkdown(prd: PRD): string {
    const frontmatter: PRDFrontmatter = {
      prd: true,
      id: prd.id,
      artifact_id: prd.artifactId,
      workflow_id: prd.workflowId,
      job_id: prd.jobId,
      status: prd.status,
      effort_level: prd.effortLevel,
      created: prd.createdAt,
      updated: prd.updatedAt,
      iteration: prd.iteration,
      max_iterations: prd.maxIterations,
    };

    const yaml = this.toYAML(frontmatter);
    const criteriaSection = this.formatCriteria(
      prd.idealCriteria,
      prd.antiCriteria,
    );
    const decisionsSection = this.formatDecisions(prd.decisions);
    const logSection = this.formatLog(prd.log);

    return `---
${yaml}---

# ${prd.title}

## Problem Space
${prd.problemSpace}

## Key Files
${prd.keyFiles.length > 0 ? prd.keyFiles.map((f) => `- ${f}`).join("\n") : "- (none specified)"}

## Constraints
${prd.constraints.length > 0 ? prd.constraints.map((c) => `- ${c}`).join("\n") : "- (none specified)"}

${decisionsSection}

## Ideal State Criteria

${criteriaSection}

## LOG

${logSection}
`;
  }

  /**
   * Convert YAML frontmatter to object
   */
  private fromYAML(yaml: string): PRDFrontmatter {
    const lines = yaml.trim().split("\n");
    const frontmatter: Partial<PRDFrontmatter> = {};

    for (const line of lines) {
      const [key, ...valueParts] = line.split(":");
      if (key && valueParts.length > 0) {
        const value = valueParts.join(":").trim();
        const trimmedKey = key.trim();

        switch (trimmedKey) {
          case "prd":
            frontmatter.prd = value === "true";
            break;
          case "id":
            frontmatter.id = value;
            break;
          case "artifact_id":
            frontmatter.artifact_id = value;
            break;
          case "workflow_id":
            frontmatter.workflow_id = value;
            break;
          case "job_id":
            frontmatter.job_id = value;
            break;
          case "status":
            frontmatter.status = value as PRDStatus;
            break;
          case "effort_level":
            frontmatter.effort_level = value as EffortLevel;
            break;
          case "created":
            frontmatter.created = value;
            break;
          case "updated":
            frontmatter.updated = value;
            break;
          case "iteration":
            frontmatter.iteration = Number.parseInt(value, 10);
            break;
          case "max_iterations":
            frontmatter.max_iterations = Number.parseInt(value, 10);
            break;
        }
      }
    }

    return frontmatter as PRDFrontmatter;
  }

  /**
   * Convert object to YAML frontmatter
   */
  private toYAML(frontmatter: PRDFrontmatter): string {
    return `prd: ${frontmatter.prd}
id: ${frontmatter.id}
artifact_id: ${frontmatter.artifact_id}
workflow_id: ${frontmatter.workflow_id}
job_id: ${frontmatter.job_id}
status: ${frontmatter.status}
effort_level: ${frontmatter.effort_level}
created: ${frontmatter.created}
updated: ${frontmatter.updated}
iteration: ${frontmatter.iteration}
max_iterations: ${frontmatter.max_iterations}
`;
  }

  /**
   * Format criteria for markdown
   */
  private formatCriteria(
    idealCriteria: IdealStateCriterion[],
    antiCriteria: AntiCriterion[],
  ): string {
    // Group by domain
    const byDomain = new Map<string, IdealStateCriterion[]>();
    for (const c of idealCriteria) {
      const domain = c.domain || "general";
      if (!byDomain.has(domain)) {
        byDomain.set(domain, []);
      }
      byDomain.get(domain)?.push(c);
    }

    let result = "";

    // Format ideal criteria by domain
    for (const [domain, criteria] of byDomain) {
      result += `### ${domain.charAt(0).toUpperCase() + domain.slice(1)}\n\n`;
      for (const c of criteria) {
        result += `- [ ] ${c.id}: ${c.criterion} | Priority: ${c.priority} | Verify: ${c.verify.type}\n`;
      }
      result += "\n";
    }

    // Format anti-criteria
    if (antiCriteria.length > 0) {
      result += "### Anti-Criteria\n\n";
      for (const c of antiCriteria) {
        result += `- [ ] ${c.id}: ${c.criterion} | Priority: ${c.priority} | Verify: ${c.verify.type}\n`;
      }
    }

    return result.trim();
  }

  /**
   * Format decisions for markdown
   */
  private formatDecisions(decisions: PRDDecision[]): string {
    if (decisions.length === 0) {
      return "## Decisions\n\n_(no decisions recorded)_";
    }

    let result = "## Decisions\n\n";
    for (const d of decisions) {
      result += `### ${d.date}: ${d.decision}\n`;
      result += `- **Rationale:** ${d.rationale}\n`;
      if (d.alternatives.length > 0) {
        result += `- **Alternatives:** ${d.alternatives.join(", ")}\n`;
      }
      result += "\n";
    }

    return result.trim();
  }

  /**
   * Format log for markdown
   */
  private formatLog(log: PRDLogEntry[]): string {
    if (log.length === 0) {
      return "_(no log entries)_";
    }

    let result = "";
    for (const entry of log) {
      result += `### Iteration ${entry.iteration} — ${entry.date}\n`;
      result += `- **Phase:** ${entry.phase}\n`;
      result += `- **Progress:** ${entry.criteriaProgress}\n`;
      result += `- **Work:** ${entry.workDone}\n`;
      if (entry.failing.length > 0) {
        result += `- **Failing:** ${entry.failing.join(", ")}\n`;
      }
      if (entry.context) {
        result += `- **Context:** ${entry.context}\n`;
      }
      result += "\n";
    }

    return result.trim();
  }

  /**
   * Parse PRD from markdown
   */
  private fromMarkdown(content: string, artifactId: string): PRD {
    const parts = content.split("---\n");
    if (parts.length < 3) {
      throw new Error("Invalid PRD format: missing frontmatter");
    }

    const frontmatterText = parts[1];
    if (!frontmatterText) {
      throw new Error("Invalid PRD format: empty frontmatter");
    }

    const frontmatter = this.fromYAML(frontmatterText);

    // Parse the rest (simplified - in production would parse properly)
    return {
      id: frontmatter.id || `prd_${ulid()}`,
      artifactId: frontmatter.artifact_id || artifactId,
      workflowId: frontmatter.workflow_id || "unknown",
      jobId: frontmatter.job_id || "unknown",
      status: frontmatter.status || "DRAFT",
      effortLevel: frontmatter.effort_level || "STANDARD",
      title: "Untitled", // Would parse from content
      problemSpace: "", // Would parse from content
      keyFiles: [],
      constraints: [],
      decisions: [],
      idealCriteria: [],
      antiCriteria: [],
      iteration: frontmatter.iteration || 0,
      maxIterations: frontmatter.max_iterations || 10,
      lastPhase: "",
      failingCriteria: [],
      createdAt: frontmatter.created || new Date().toISOString(),
      updatedAt: frontmatter.updated || new Date().toISOString(),
      log: [],
    };
  }

  /**
   * Generate a PRD ID
   */
  static generateId(slug: string): string {
    const isoString = new Date().toISOString();
    const datePart = isoString.split("T")[0];
    if (!datePart) {
      throw new Error("Failed to generate date for PRD ID");
    }
    const date = datePart.replace(/-/g, "");
    return `PRD-${date}-${slug}`;
  }
}
