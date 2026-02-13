import { expect } from "bun:test";
import type { DomainEvent, Job } from "../../src/core/types";

/**
 * Custom matchers for Atlas tests
 */

/**
 * Check if job has expected status
 */
export function expectJobStatus(job: Job | null, expectedStatus: string) {
  expect(job).not.toBeNull();
  expect(job?.status).toBe(expectedStatus);
}

/**
 * Check if domain event matches expected type
 */
export function expectDomainEvent(
  event: DomainEvent | null,
  expectedType: string,
) {
  expect(event).not.toBeNull();
  expect(event?.type).toBe(expectedType);
}

/**
 * Check if array contains item matching predicate
 */
export function expectArrayContains<T>(
  array: T[],
  predicate: (item: T) => boolean,
  message?: string,
) {
  const found = array.some(predicate);
  expect(found).toBe(true);
  if (!found && message) {
    throw new Error(message);
  }
}

/**
 * Check if ISO date string is recent (within last minute)
 */
export function expectRecentTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  expect(diffMs).toBeLessThan(60000); // 1 minute
  expect(diffMs).toBeGreaterThanOrEqual(0);
}

/**
 * Check if JSON string parses correctly
 */
export function expectValidJson(jsonString: string | null) {
  expect(jsonString).not.toBeNull();
  if (jsonString === null) return;
  expect(() => JSON.parse(jsonString)).not.toThrow();
}
