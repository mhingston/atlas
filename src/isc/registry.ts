/**
 * ISC Registry
 *
 * Manages ISC definitions for different artifact types.
 */

import type { ISCDefinition } from "./types";

export class ISCRegistry {
  private criteria: Map<string, ISCDefinition> = new Map();

  register(artifactType: string, definition: ISCDefinition): void {
    this.criteria.set(artifactType, definition);
  }

  getCriteria(artifactType: string): ISCDefinition | undefined {
    return this.criteria.get(artifactType);
  }

  hasCriteria(artifactType: string): boolean {
    return this.criteria.has(artifactType);
  }

  listRegistered(): string[] {
    return Array.from(this.criteria.keys());
  }

  unregister(artifactType: string): boolean {
    return this.criteria.delete(artifactType);
  }

  clear(): void {
    this.criteria.clear();
  }
}

// Global registry instance
export const globalISCRegistry = new ISCRegistry();
