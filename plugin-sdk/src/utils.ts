/**
 * Atlas Plugin SDK - Utility Functions
 *
 * Helper functions for plugin authors.
 */

import type {
  Artifact,
  Entity,
  Event,
  ExternalPlugin,
  PluginManifest,
  SinkPlugin,
  SourcePlugin,
  WorkflowPlugin,
} from "./types.js";

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a unique ID with optional prefix
 */
export function generateId(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const id = `${timestamp}${random}`;
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Generate an entity ID
 */
export function generateEntityId(source: string, localId: string): string {
  return `${source}:${localId}`;
}

/**
 * Generate an artifact ID
 */
export function generateArtifactId(type: string): string {
  return generateId(type.replace(/\./g, "_"));
}

// ============================================================================
// Date Utilities
// ============================================================================

/**
 * Get current timestamp in ISO format
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Parse ISO date string
 */
export function parseIso(date: string): Date {
  return new Date(date);
}

/**
 * Format date for display
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString();
}

/**
 * Check if date is within range
 */
export function isWithinRange(
  date: string,
  since?: string,
  until?: string,
): boolean {
  const d = new Date(date).getTime();
  if (since && d < new Date(since).getTime()) return false;
  if (until && d > new Date(until).getTime()) return false;
  return true;
}

// ============================================================================
// Artifact Builders
// ============================================================================

/**
 * Builder for creating artifacts with defaults
 */
export class ArtifactBuilder {
  private artifact: Partial<Artifact> = {
    created_at: nowIso(),
    data: {},
  };

  type(type: string): this {
    this.artifact.type = type;
    return this;
  }

  jobId(jobId: string): this {
    this.artifact.job_id = jobId;
    return this;
  }

  title(title: string): this {
    this.artifact.title = title;
    return this;
  }

  content(content: string): this {
    this.artifact.content_md = content;
    return this;
  }

  data(data: Record<string, unknown>): this {
    this.artifact.data = { ...this.artifact.data, ...data };
    return this;
  }

  schemaVersion(version: string): this {
    this.artifact.data = {
      ...this.artifact.data,
      schema_version: version,
    };
    return this;
  }

  producedBy(workflowId: string): this {
    this.artifact.data = {
      ...this.artifact.data,
      produced_by: workflowId,
    };
    return this;
  }

  build(): Artifact {
    if (!this.artifact.type) {
      throw new Error("Artifact type is required");
    }
    return {
      id: generateArtifactId(this.artifact.type),
      type: this.artifact.type,
      job_id: this.artifact.job_id,
      title: this.artifact.title,
      content_md: this.artifact.content_md,
      data: this.artifact.data || {},
      created_at: this.artifact.created_at || nowIso(),
    };
  }
}

/**
 * Create an artifact builder
 */
export function createArtifact(type: string): ArtifactBuilder {
  return new ArtifactBuilder().type(type);
}

// ============================================================================
// Entity Builders
// ============================================================================

/**
 * Create an entity
 */
export function createEntity(
  source: string,
  type: string,
  localId: string,
  data: {
    title?: string;
    url?: string;
    status?: string;
    [key: string]: unknown;
  },
): Entity {
  return {
    id: generateEntityId(source, localId),
    type,
    source,
    title: data.title,
    url: data.url,
    status: data.status,
    data,
    updated_at: nowIso(),
  };
}

// ============================================================================
// Event Builders
// ============================================================================

/**
 * Create an event
 */
export function createEvent(
  entityId: string,
  type: string,
  data: Record<string, unknown>,
  options?: {
    id?: string;
    actor?: string;
    body?: string;
  },
): Event {
  return {
    id: options?.id || generateId("evt"),
    entity_id: entityId,
    type,
    actor: options?.actor,
    created_at: nowIso(),
    body: options?.body,
    data,
  };
}

// ============================================================================
// Plugin Factories
// ============================================================================

/**
 * Create a source plugin with common defaults
 */
export function createSourcePlugin(
  id: string,
  syncFn: SourcePlugin["sync"],
): SourcePlugin {
  return {
    id,
    sync: syncFn,
  };
}

/**
 * Create a workflow plugin with common defaults
 */
export function createWorkflowPlugin(
  id: string,
  runFn: WorkflowPlugin["run"],
): WorkflowPlugin {
  return {
    id,
    run: runFn,
  };
}

/**
 * Create a sink plugin with common defaults
 */
export function createSinkPlugin(
  id: string,
  handleFn: SinkPlugin["handle"],
): SinkPlugin {
  return {
    id,
    handle: handleFn,
  };
}

// ============================================================================
// External Plugin Factory
// ============================================================================

interface ExternalPluginOptions {
  manifest: PluginManifest;
  initialize?: ExternalPlugin["initialize"];
  shutdown?: ExternalPlugin["shutdown"];
  health?: ExternalPlugin["health"];
  sources?: SourcePlugin[];
  workflows?: WorkflowPlugin[];
  sinks?: SinkPlugin[];
}

/**
 * Create an external plugin with all components
 */
export function createPlugin(options: ExternalPluginOptions): ExternalPlugin {
  return {
    manifest: options.manifest,
    initialize: options.initialize,
    shutdown: options.shutdown,
    health: options.health,
    sources: options.sources || [],
    workflows: options.workflows || [],
    sinks: options.sinks || [],
  };
}

// ============================================================================
// Content Utilities
// ============================================================================

/**
 * Truncate text to max length
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

/**
 * Convert markdown to plain text (basic)
 */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/#+ /g, "") // Remove headers
    .replace(/\*\*|__/g, "") // Remove bold
    .replace(/\*|_/g, "") // Remove italic
    .replace(/`{3}[\s\S]*?`{3}/g, "") // Remove code blocks
    .replace(/`([^`]+)`/g, "$1") // Remove inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove links
    .replace(/\n+/g, " ") // Normalize whitespace
    .trim();
}

/**
 * Extract tags from text
 */
export function extractTags(text: string): string[] {
  const tagRegex = /#([a-zA-Z0-9_-]+)/g;
  const matches = text.matchAll(tagRegex);
  const tags = Array.from(matches)
    .map((m) => m[1])
    .filter((tag): tag is string => tag !== undefined);
  return Array.from(new Set(tags));
}

/**
 * Sanitize string for use as ID
 */
export function sanitizeId(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Check if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Check if value is a valid URL
 */
export function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if value is a valid email
 */
export function isValidEmail(value: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

// ============================================================================
// Array Utilities
// ============================================================================

/**
 * Remove duplicates from array
 */
export function unique<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

/**
 * Group array by key
 */
export function groupBy<T>(
  array: T[],
  keyFn: (item: T) => string,
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of array) {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

/**
 * Chunk array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ============================================================================
// Async Utilities
// ============================================================================

/**
 * Sleep for ms milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
  } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts || 3;
  const delayMs = options.delayMs || 1000;
  const backoffMultiplier = options.backoffMultiplier || 2;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === maxAttempts) break;
      await sleep(delayMs * backoffMultiplier ** (attempt - 1));
    }
  }

  throw lastError;
}

/**
 * Timeout a promise
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = "Operation timed out",
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms),
    ),
  ]);
}
