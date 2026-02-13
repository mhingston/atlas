import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyCommand } from "../../src/core/apply";
import { getCount, getField, getOptionalRow, getRow } from "../helpers/db";
import { createTestDb, fixtures, runTestMigrations } from "../helpers/fixtures";

function getTableCount(db: Database, table: string): number {
  return getCount(db, `SELECT COUNT(*) as count FROM ${table}`);
}

describe("applyCommand", () => {
  let db: Database;
  beforeEach(() => {
    db = createTestDb();
    runTestMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  test("should upsert entity and emit domain event", () => {
    const entity = fixtures.entity({ id: "ent_apply_1", title: "First" });
    applyCommand(db, { type: "entity.upsert", entity });

    const row = getRow(db, "SELECT * FROM entities WHERE id = ?", [entity.id]);
    expect(row).toBeTruthy();
    expect(getField<string | null>(row, "title")).toBe("First");

    const de = getRow(db, "SELECT * FROM domain_events WHERE type = ?", [
      "entity.upserted",
    ]);
    expect(de).toBeTruthy();
  });

  test("should insert event and emit domain event", () => {
    const entity = fixtures.entity({ id: "ent_apply_2" });
    applyCommand(db, { type: "entity.upsert", entity });

    const event = fixtures.event(entity.id, { id: "evt_apply_1" });
    applyCommand(db, { type: "event.insert", event });

    const row = getRow(db, "SELECT * FROM events WHERE id = ?", [event.id]);
    expect(row).toBeTruthy();

    const de = getRow(db, "SELECT * FROM domain_events WHERE type = ?", [
      "event.inserted",
    ]);
    expect(de).toBeTruthy();
  });

  test("should create job and update status timestamps", () => {
    const job = fixtures.job({ id: "job_apply_1" });
    applyCommand(db, {
      type: "job.create",
      job: { id: job.id, workflow_id: job.workflow_id, input: job.input },
    });

    let row = getRow(db, "SELECT * FROM jobs WHERE id = ?", [job.id]);
    expect(getField<string>(row, "status")).toBe("queued");
    expect(getField<string | null>(row, "started_at")).toBeNull();

    applyCommand(db, {
      type: "job.updateStatus",
      id: job.id,
      status: "running",
    });
    row = getRow(db, "SELECT * FROM jobs WHERE id = ?", [job.id]);
    expect(getField<string>(row, "status")).toBe("running");
    expect(getField<string | null>(row, "started_at")).not.toBeNull();

    applyCommand(db, {
      type: "job.updateStatus",
      id: job.id,
      status: "succeeded",
    });
    row = getRow(db, "SELECT * FROM jobs WHERE id = ?", [job.id]);
    expect(getField<string | null>(row, "finished_at")).not.toBeNull();
  });

  test("should create and update artifact data", () => {
    applyCommand(db, {
      type: "artifact.create",
      artifact: {
        type: "test.artifact",
        job_id: null,
        title: "First",
        content_md: "Initial",
        data: { a: 1 },
      },
    });

    const art = getRow(db, "SELECT * FROM artifacts LIMIT 1");
    expect(art).toBeTruthy();

    applyCommand(db, {
      type: "artifact.update",
      id: art.id,
      patch: { title: "Updated", data: { b: 2 } },
    });

    const updated = getRow(db, "SELECT * FROM artifacts WHERE id = ?", [
      getField<string>(art, "id"),
    ]);
    expect(getField<string | null>(updated, "title")).toBe("Updated");
    expect(JSON.parse(getField<string>(updated, "data_json"))).toEqual({
      b: 2,
    });
  });

  test("should emit and mark domain events delivered", () => {
    applyCommand(db, {
      type: "domainEvent.emit",
      event: {
        id: "de_custom",
        type: "custom.event",
        created_at: new Date().toISOString(),
        aggregate_id: null,
        payload: { ok: true },
      },
    });

    const row = getRow(db, "SELECT * FROM domain_events WHERE type = ?", [
      "custom.event",
    ]);
    expect(row).toBeTruthy();
    expect(getField<number>(row, "delivered")).toBe(0);

    applyCommand(db, { type: "domainEvent.markDelivered", id: row.id });
    const marked = getRow(db, "SELECT * FROM domain_events WHERE id = ?", [
      getField<string>(row, "id"),
    ]);
    expect(getField<number>(marked, "delivered")).toBe(1);
  });

  test("should prune old records", () => {
    const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(
      "INSERT INTO domain_events (id,type,created_at,aggregate_id,payload_json,delivered) VALUES (?,?,?,?,?,1)",
    ).run("de_old", "old.event", old, null, "{}");
    db.prepare(
      "INSERT INTO jobs (id,workflow_id,status,input_json,started_at,finished_at,log_json) VALUES (?,?,?,?,?,?,?)",
    ).run("job_old", "wf", "succeeded", "{}", old, old, null);
    db.prepare(
      "INSERT INTO artifacts (id,type,job_id,title,content_md,data_json,created_at) VALUES (?,?,?,?,?,?,?)",
    ).run("art_old", "old.art", null, null, null, "{}", old);
    db.prepare(
      "INSERT INTO events (id,entity_id,type,actor,created_at,body,data_json) VALUES (?,?,?,?,?,?,?)",
    ).run("evt_old", "ent", "old.event", null, old, null, "{}");

    applyCommand(db, {
      type: "maintenance.prune",
      policy: {
        delivered_domain_events_days: 7,
        jobs_days: 30,
        artifacts_days: 90,
        events_days: 60,
      },
    });

    expect(getTableCount(db, "domain_events")).toBe(1); // maintenance.pruned event
    expect(getTableCount(db, "jobs")).toBe(0);
    expect(getTableCount(db, "artifacts")).toBe(0);
    expect(getTableCount(db, "events")).toBe(0);
  });

  test("should upsert and delete embeddings", () => {
    applyCommand(db, {
      type: "embedding.upsert",
      data: {
        id: "emb_ignored",
        owner_type: "artifact",
        owner_id: "art_embed_1",
        provider: "mock",
        model: "mock-embedding",
        dims: 3,
        vector: [0.1, 0.2, 0.3],
        content_hash: "hash1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    const emb = getRow(db, "SELECT * FROM embeddings WHERE owner_id = ?", [
      "art_embed_1",
    ]);
    expect(emb).toBeTruthy();
    expect(getField<string>(emb, "id")).toBe("emb_artifact_art_embed_1");

    applyCommand(db, {
      type: "embedding.deleteByOwner",
      owner_type: "artifact",
      owner_id: "art_embed_1",
    });
    const after = getOptionalRow(
      db,
      "SELECT * FROM embeddings WHERE owner_id = ?",
      ["art_embed_1"],
    );
    expect(after).toBeNull();
  });
});
