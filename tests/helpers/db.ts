import type { Database } from "bun:sqlite";

function assertRecord(
  value: unknown,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new Error("Expected record");
  }
}

export function getCount(
  db: Database,
  sql: string,
  params: unknown[] = [],
): number {
  const row = db.prepare(sql).get(...params);
  assertRecord(row);
  const count = row.count;
  if (typeof count !== "number") {
    throw new Error("Expected count to be a number");
  }
  return count;
}

export function getRow(
  db: Database,
  sql: string,
  params: unknown[] = [],
): Record<string, unknown> {
  const row = db.prepare(sql).get(...params);
  assertRecord(row);
  return row;
}

export function getOptionalRow(
  db: Database,
  sql: string,
  params: unknown[] = [],
): Record<string, unknown> | null {
  const row = db.prepare(sql).get(...params);
  if (!row) return null;
  assertRecord(row);
  return row;
}

export function getField<T>(row: Record<string, unknown>, key: string): T {
  return row[key] as T;
}

export function getStringField(
  db: Database,
  sql: string,
  field: string,
  params: unknown[] = [],
): string {
  const row = getRow(db, sql, params);
  const value = row[field];
  if (typeof value !== "string") {
    throw new Error(`Expected ${field} to be a string`);
  }
  return value;
}

export function getNameList(
  db: Database,
  sql: string,
  params: unknown[] = [],
): string[] {
  const rows = db.prepare(sql).all(...params);
  if (!Array.isArray(rows)) {
    throw new Error("Expected rows to be an array");
  }
  return rows.map((row) => {
    assertRecord(row);
    const name = row.name;
    if (typeof name !== "string") {
      throw new Error("Expected name to be a string");
    }
    return name;
  });
}
