import { describe, expect, test } from "bun:test";
import { db, runMigrations } from "../../src/core/db";
import { getNameList, getStringField } from "../helpers/db";

describe("Database", () => {
  describe("initialization", () => {
    test("should initialize database successfully", () => {
      expect(db).toBeDefined();
    });

    test("should be using WAL mode", () => {
      const journalMode = getStringField(
        db,
        "PRAGMA journal_mode",
        "journal_mode",
      );
      expect(journalMode).toBe("wal");
    });
  });

  describe("migrations", () => {
    test("should run migrations without error", () => {
      expect(() => runMigrations()).not.toThrow();
    });

    test("should create all required tables", () => {
      const tableNames = getNameList(
        db,
        `
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `,
      );
      expect(tableNames).toContain("entities");
      expect(tableNames).toContain("events");
      expect(tableNames).toContain("jobs");
      expect(tableNames).toContain("artifacts");
      expect(tableNames).toContain("domain_events");
    });

    test("should create indexes for performance", () => {
      const indexNames = getNameList(
        db,
        `
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name LIKE 'idx_%'
      `,
      );

      expect(indexNames.length).toBeGreaterThan(0);
      expect(indexNames).toContain("idx_entities_type");
      expect(indexNames).toContain("idx_jobs_status");
      expect(indexNames).toContain("idx_artifacts_type");
    });
  });

  describe("table structure", () => {
    test("entities table should have correct columns", () => {
      const columnNames = getNameList(db, "PRAGMA table_info(entities)");

      expect(columnNames).toContain("id");
      expect(columnNames).toContain("type");
      expect(columnNames).toContain("source");
      expect(columnNames).toContain("title");
      expect(columnNames).toContain("url");
      expect(columnNames).toContain("status");
      expect(columnNames).toContain("updated_at");
      expect(columnNames).toContain("data_json");
    });

    test("jobs table should have correct columns", () => {
      const columnNames = getNameList(db, "PRAGMA table_info(jobs)");

      expect(columnNames).toContain("id");
      expect(columnNames).toContain("workflow_id");
      expect(columnNames).toContain("status");
      expect(columnNames).toContain("input_json");
      expect(columnNames).toContain("started_at");
      expect(columnNames).toContain("finished_at");
      expect(columnNames).toContain("log_json");
    });

    test("artifacts table should have correct columns", () => {
      const columnNames = getNameList(db, "PRAGMA table_info(artifacts)");

      expect(columnNames).toContain("id");
      expect(columnNames).toContain("type");
      expect(columnNames).toContain("job_id");
      expect(columnNames).toContain("title");
      expect(columnNames).toContain("content_md");
      expect(columnNames).toContain("data_json");
      expect(columnNames).toContain("created_at");
    });
  });
});
