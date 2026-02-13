import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { ReadOnlyRepo } from "../../src/core/repo";
import {
  createTestDb,
  dbHelpers,
  fixtures,
  runTestMigrations,
} from "../helpers/fixtures";

describe("ReadOnlyRepo", () => {
  let db: Database;
  let repo: ReadOnlyRepo;

  beforeEach(() => {
    db = createTestDb();
    runTestMigrations(db);
    repo = new ReadOnlyRepo(db);
  });

  describe("getJob", () => {
    test("should return job by ID", () => {
      const job = fixtures.job({ id: "job_test123" });
      dbHelpers.insertJob(db, job);

      const result = repo.getJob("job_test123");
      expect(result).not.toBeNull();
      expect(result?.id).toBe("job_test123");
      expect(result?.workflow_id).toBe(job.workflow_id);
    });

    test("should return null for non-existent job", () => {
      const result = repo.getJob("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("listJobs", () => {
    test("should return all jobs when no filters", () => {
      dbHelpers.insertJob(db, fixtures.job());
      dbHelpers.insertJob(db, fixtures.job());
      dbHelpers.insertJob(db, fixtures.job());

      const jobs = repo.listJobs({});
      expect(jobs.length).toBe(3);
    });

    test("should filter jobs by status", () => {
      dbHelpers.insertJob(db, fixtures.job({ status: "queued" }));
      dbHelpers.insertJob(db, fixtures.job({ status: "running" }));
      dbHelpers.insertJob(db, fixtures.job({ status: "queued" }));

      const queued = repo.listJobs({ status: "queued" });
      expect(queued.length).toBe(2);
      expect(queued.every((j) => j.status === "queued")).toBe(true);
    });

    test("should respect limit parameter", () => {
      for (let i = 0; i < 10; i++) {
        dbHelpers.insertJob(db, fixtures.job());
      }

      const jobs = repo.listJobs({ limit: 5 });
      expect(jobs.length).toBe(5);
    });

    test("should use default limit when not specified", () => {
      for (let i = 0; i < 30; i++) {
        dbHelpers.insertJob(db, fixtures.job());
      }

      const jobs = repo.listJobs({});
      expect(jobs.length).toBeLessThanOrEqual(20); // Default limit in implementation
    });

    test("should respect afterId cursor", () => {
      const jobA = fixtures.job({ id: "job_a" });
      const jobB = fixtures.job({ id: "job_b" });
      const jobC = fixtures.job({ id: "job_c" });
      dbHelpers.insertJob(db, jobA);
      dbHelpers.insertJob(db, jobB);
      dbHelpers.insertJob(db, jobC);

      const jobs = repo.listJobs({ afterId: "job_b" });
      expect(jobs.every((job) => job.id < "job_b")).toBe(true);
    });
  });

  describe("getEntity", () => {
    test("should return entity by ID", () => {
      const entity = fixtures.entity({ id: "ent_test123" });
      dbHelpers.insertEntity(db, entity);

      const result = repo.getEntity("ent_test123");
      expect(result).not.toBeNull();
      expect(result?.id).toBe("ent_test123");
    });

    test("should return null for non-existent entity", () => {
      const result = repo.getEntity("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("listEntities", () => {
    test("should filter by type and source", () => {
      dbHelpers.insertEntity(
        db,
        fixtures.entity({ type: "alpha", source: "source.a" }),
      );
      dbHelpers.insertEntity(
        db,
        fixtures.entity({ type: "alpha", source: "source.b" }),
      );
      dbHelpers.insertEntity(
        db,
        fixtures.entity({ type: "beta", source: "source.a" }),
      );

      const results = repo.listEntities({ type: "alpha", source: "source.a" });
      expect(results.length).toBe(1);
      expect(results[0].type).toBe("alpha");
      expect(results[0].source).toBe("source.a");
    });

    test("should respect limit", () => {
      for (let i = 0; i < 5; i++) {
        dbHelpers.insertEntity(db, fixtures.entity({ type: "limit.test" }));
      }

      const results = repo.listEntities({ limit: 2 });
      expect(results.length).toBe(2);
    });
  });

  describe("getEvents", () => {
    test("should filter by since and limit", () => {
      const entity = fixtures.entity({ id: "ent_events_1" });
      dbHelpers.insertEntity(db, entity);

      const oldEvent = fixtures.event(entity.id, {
        id: "evt_old",
        created_at: "2020-01-01T00:00:00.000Z",
      });
      const newEvent = fixtures.event(entity.id, {
        id: "evt_new",
        created_at: "2026-01-01T00:00:00.000Z",
      });

      db.prepare(
        "INSERT INTO events (id,entity_id,type,actor,created_at,body,data_json) VALUES (?,?,?,?,?,?,?)",
      ).run(
        oldEvent.id,
        oldEvent.entity_id,
        oldEvent.type,
        oldEvent.actor,
        oldEvent.created_at,
        oldEvent.body,
        JSON.stringify(oldEvent.data),
      );
      db.prepare(
        "INSERT INTO events (id,entity_id,type,actor,created_at,body,data_json) VALUES (?,?,?,?,?,?,?)",
      ).run(
        newEvent.id,
        newEvent.entity_id,
        newEvent.type,
        newEvent.actor,
        newEvent.created_at,
        newEvent.body,
        JSON.stringify(newEvent.data),
      );

      const results = repo.getEvents(entity.id, {
        since: "2025-12-31T00:00:00.000Z",
        limit: 1,
      });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe("evt_new");
    });
  });

  describe("findArtifacts", () => {
    test("should return all artifacts when no filters", () => {
      dbHelpers.insertArtifact(db, fixtures.artifact());
      dbHelpers.insertArtifact(db, fixtures.artifact());

      const artifacts = repo.findArtifacts({});
      expect(artifacts.length).toBe(2);
    });

    test("should filter artifacts by type", () => {
      dbHelpers.insertArtifact(db, fixtures.artifact({ type: "test.v1" }));
      dbHelpers.insertArtifact(db, fixtures.artifact({ type: "other.v1" }));
      dbHelpers.insertArtifact(db, fixtures.artifact({ type: "test.v1" }));

      const results = repo.findArtifacts({ type: "test.v1" });
      expect(results.length).toBe(2);
      expect(results.every((a) => a.type === "test.v1")).toBe(true);
    });

    test("should filter artifacts by job_id", () => {
      const jobId = "job_test123";
      dbHelpers.insertArtifact(db, fixtures.artifact({ job_id: jobId }));
      dbHelpers.insertArtifact(db, fixtures.artifact({ job_id: "other_job" }));

      const results = repo.findArtifacts({ jobId });
      expect(results.length).toBe(1);
      expect(results[0].job_id).toBe(jobId);
    });

    test("should respect limit parameter", () => {
      for (let i = 0; i < 10; i++) {
        dbHelpers.insertArtifact(db, fixtures.artifact());
      }

      const artifacts = repo.findArtifacts({ limit: 3 });
      expect(artifacts.length).toBe(3);
    });

    test("should filter by multiple criteria", () => {
      const jobId = "job_test123";
      dbHelpers.insertArtifact(
        db,
        fixtures.artifact({ type: "test.v1", job_id: jobId }),
      );
      dbHelpers.insertArtifact(
        db,
        fixtures.artifact({ type: "test.v1", job_id: "other" }),
      );
      dbHelpers.insertArtifact(
        db,
        fixtures.artifact({ type: "other.v1", job_id: jobId }),
      );

      const results = repo.findArtifacts({ type: "test.v1", jobId });
      expect(results.length).toBe(1);
      expect(results[0].type).toBe("test.v1");
      expect(results[0].job_id).toBe(jobId);
    });
  });

  describe("getArtifact", () => {
    test("should return artifact by ID", () => {
      const artifact = fixtures.artifact({ id: "art_test123" });
      dbHelpers.insertArtifact(db, artifact);

      const result = repo.getArtifact("art_test123");
      expect(result).not.toBeNull();
      expect(result?.id).toBe("art_test123");
    });

    test("should return null for non-existent artifact", () => {
      const result = repo.getArtifact("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("embeddings", () => {
    test("should read embeddings by id and owner", () => {
      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO embeddings (id, owner_type, owner_id, provider, model, dims, vector_json, content_hash, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ).run(
        "emb_1",
        "artifact",
        "art_1",
        "mock",
        "mock-embedding",
        3,
        JSON.stringify([0.1, 0.2, 0.3]),
        "hash",
        now,
        now,
      );

      const byId = repo.getEmbedding("emb_1");
      expect(byId?.owner_id).toBe("art_1");

      const byOwner = repo.getEmbeddingsByOwner("artifact", "art_1");
      expect(byOwner.length).toBe(1);
    });

    test("should list embeddings with filters", () => {
      const now = new Date().toISOString();
      const earlier = "2025-01-01T00:00:00.000Z";
      db.prepare(
        "INSERT INTO embeddings (id, owner_type, owner_id, provider, model, dims, vector_json, content_hash, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ).run(
        "emb_a",
        "artifact",
        "art_a",
        "mock",
        "mock-embedding",
        3,
        JSON.stringify([0.1, 0.2, 0.3]),
        "hash",
        earlier,
        earlier,
      );
      db.prepare(
        "INSERT INTO embeddings (id, owner_type, owner_id, provider, model, dims, vector_json, content_hash, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ).run(
        "emb_b",
        "entity",
        "ent_b",
        "mock",
        "mock-embedding",
        3,
        JSON.stringify([0.4, 0.5, 0.6]),
        "hash2",
        now,
        now,
      );

      const filtered = repo.listEmbeddings({
        owner_type: "entity",
        since: "2026-01-01T00:00:00.000Z",
      });
      expect(filtered.length).toBe(1);
      expect(filtered[0].owner_type).toBe("entity");
    });
  });

  describe("countJobsByStatus", () => {
    test("should count jobs by status", () => {
      dbHelpers.insertJob(db, fixtures.job({ status: "queued" }));
      dbHelpers.insertJob(db, fixtures.job({ status: "queued" }));
      dbHelpers.insertJob(db, fixtures.job({ status: "failed" }));

      const counts = repo.countJobsByStatus();
      expect(counts.queued).toBeGreaterThanOrEqual(2);
      expect(counts.failed).toBeGreaterThanOrEqual(1);
    });
  });

  describe("data integrity", () => {
    test("should parse JSON fields correctly", () => {
      const job = fixtures.job({
        input: { test: true, nested: { value: 42 } },
      });
      dbHelpers.insertJob(db, job);

      const result = repo.getJob(job.id);
      expect(result?.input).toEqual({ test: true, nested: { value: 42 } });
    });

    test("should handle null optional fields", () => {
      const job = fixtures.job({
        started_at: null,
        finished_at: null,
        log: null,
      });
      dbHelpers.insertJob(db, job);

      const result = repo.getJob(job.id);
      expect(result?.started_at).toBeNull();
      expect(result?.finished_at).toBeNull();
      expect(result?.log).toBeNull();
    });
  });
});
