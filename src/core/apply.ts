import type { Database } from "bun:sqlite";
import { ulid } from "ulid";
import type { Command } from "./commands";

function nowIso() {
  return new Date().toISOString();
}

export function applyCommand(db: Database, cmd: Command) {
  switch (cmd.type) {
    case "entity.upsert": {
      const e = cmd.entity;
      db.prepare(`
        INSERT INTO entities (id,type,source,title,url,status,updated_at,data_json)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          type=excluded.type,
          source=excluded.source,
          title=excluded.title,
          url=excluded.url,
          status=excluded.status,
          updated_at=excluded.updated_at,
          data_json=excluded.data_json
      `).run(
        e.id,
        e.type,
        e.source,
        e.title ?? null,
        e.url ?? null,
        e.status ?? null,
        e.updated_at,
        JSON.stringify(e.data ?? {}),
      );

      emit(db, "entity.upserted", e.id, {
        entity_id: e.id,
        type: e.type,
        source: e.source,
      });
      return;
    }
    case "event.insert": {
      const ev = cmd.event;
      db.prepare(`
        INSERT OR IGNORE INTO events (id,entity_id,type,actor,created_at,body,data_json)
        VALUES (?,?,?,?,?,?,?)
      `).run(
        ev.id,
        ev.entity_id,
        ev.type,
        ev.actor ?? null,
        ev.created_at,
        ev.body ?? null,
        JSON.stringify(ev.data ?? {}),
      );

      emit(db, "event.inserted", ev.id, {
        event_id: ev.id,
        entity_id: ev.entity_id,
        type: ev.type,
      });
      return;
    }
    case "job.create": {
      const id = cmd.job.id;
      db.prepare(`
        INSERT INTO jobs (id,workflow_id,status,input_json,started_at,finished_at,log_json)
        VALUES (?,?, 'queued', ?, NULL, NULL, NULL)
      `).run(id, cmd.job.workflow_id, JSON.stringify(cmd.job.input ?? {}));

      emit(db, "job.created", id, {
        job_id: id,
        workflow_id: cmd.job.workflow_id,
      });
      insertTraceEvent(db, {
        trace_id: id,
        job_id: id,
        workflow_id: cmd.job.workflow_id,
        kind: "job.created",
        message: "Job enqueued",
        data: { status: "queued" },
        created_at: nowIso(),
      });
      return;
    }
    case "job.updateStatus": {
      db.prepare(`
        UPDATE jobs SET status = ?,
          started_at = COALESCE(started_at, CASE WHEN ?='running' THEN ? ELSE started_at END),
          finished_at = CASE WHEN ? IN ('succeeded','failed') THEN ? ELSE finished_at END
        WHERE id = ?
      `).run(cmd.status, cmd.status, nowIso(), cmd.status, nowIso(), cmd.id);

      emit(db, "job.status_changed", cmd.id, {
        job_id: cmd.id,
        status: cmd.status,
      });
      interface WorkflowRow {
        workflow_id: string | null;
      }
      const workflowRow = db
        .prepare("SELECT workflow_id FROM jobs WHERE id = ?")
        .get(cmd.id) as WorkflowRow | null;
      insertTraceEvent(db, {
        trace_id: cmd.id,
        job_id: cmd.id,
        workflow_id: workflowRow?.workflow_id ?? null,
        kind: "job.status",
        message: `Job status changed to ${cmd.status}`,
        status: cmd.status,
        data: { status: cmd.status },
        created_at: nowIso(),
      });
      return;
    }
    case "artifact.create": {
      const id = `art_${ulid()}`;
      const a = cmd.artifact;
      db.prepare(`
        INSERT INTO artifacts (id,type,job_id,title,content_md,data_json,created_at)
        VALUES (?,?,?,?,?,?,?)
      `).run(
        id,
        a.type,
        a.job_id ?? null,
        a.title ?? null,
        a.content_md ?? null,
        JSON.stringify(a.data ?? {}),
        nowIso(),
      );

      emit(db, "artifact.created", id, {
        artifact_id: id,
        type: a.type,
        job_id: a.job_id ?? null,
      });
      if (a.job_id) {
        const jobRow = db
          .prepare("SELECT workflow_id FROM jobs WHERE id = ?")
          .get(a.job_id) as { workflow_id: string } | undefined;
        insertTraceEvent(db, {
          trace_id: a.job_id,
          job_id: a.job_id,
          workflow_id: jobRow?.workflow_id ?? null,
          kind: "artifact.created",
          message: `Artifact created (${a.type})`,
          data: {
            artifact_id: id,
            artifact_type: a.type,
            has_title: Boolean(a.title),
            has_content: Boolean(a.content_md),
          },
          created_at: nowIso(),
        });
      }
      return;
    }
    case "artifact.update": {
      interface ArtifactRow {
        data_json: string | null;
      }
      const row = db
        .prepare("SELECT data_json FROM artifacts WHERE id=?")
        .get(cmd.id) as ArtifactRow | null;
      const existing = row?.data_json ? JSON.parse(row.data_json) : {};
      const next = cmd.patch.data ?? existing;

      db.prepare(`
        UPDATE artifacts SET
          title = COALESCE(?, title),
          content_md = COALESCE(?, content_md),
          data_json = ?
        WHERE id = ?
      `).run(
        cmd.patch.title ?? null,
        cmd.patch.content_md ?? null,
        JSON.stringify(next),
        cmd.id,
      );

      emit(db, "artifact.updated", cmd.id, { artifact_id: cmd.id });
      return;
    }
    case "domainEvent.emit": {
      emit(
        db,
        cmd.event.type,
        cmd.event.aggregate_id ?? null,
        cmd.event.payload ?? {},
      );
      return;
    }
    case "domainEvent.markDelivered": {
      db.prepare("UPDATE domain_events SET delivered=1 WHERE id=?").run(cmd.id);
      return;
    }
    case "maintenance.prune": {
      const p = cmd.policy ?? {};
      const days = (n: number) => n * 24 * 60 * 60 * 1000;
      const cutoff = (ms: number) => new Date(Date.now() - ms).toISOString();

      const deDays = p.delivered_domain_events_days ?? 7;
      db.prepare(
        "DELETE FROM domain_events WHERE delivered=1 AND created_at < ?",
      ).run(cutoff(days(deDays)));

      const jobDays = p.jobs_days ?? 30;
      db.prepare(
        "DELETE FROM jobs WHERE finished_at IS NOT NULL AND finished_at < ?",
      ).run(cutoff(days(jobDays)));

      const artDays = p.artifacts_days ?? 90;
      db.prepare("DELETE FROM artifacts WHERE created_at < ?").run(
        cutoff(days(artDays)),
      );

      const evDays = p.events_days ?? 60;
      db.prepare("DELETE FROM events WHERE created_at < ?").run(
        cutoff(days(evDays)),
      );

      const traceDays = p.traces_days ?? 30;
      db.prepare("DELETE FROM trace_events WHERE created_at < ?").run(
        cutoff(days(traceDays)),
      );

      emit(db, "maintenance.pruned", null, { policy: p });
      return;
    }
    case "embedding.upsert": {
      const e = cmd.data;
      // Use deterministic ID based on owner_type and owner_id
      const deterministicId = `emb_${e.owner_type}_${e.owner_id}`;
      db.prepare(`
        INSERT INTO embeddings (id, owner_type, owner_id, provider, model, dims, vector_json, content_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_type, owner_id) DO UPDATE SET
          id = excluded.id,
          provider = excluded.provider,
          model = excluded.model,
          dims = excluded.dims,
          vector_json = excluded.vector_json,
          content_hash = excluded.content_hash,
          updated_at = excluded.updated_at
      `).run(
        deterministicId,
        e.owner_type,
        e.owner_id,
        e.provider,
        e.model,
        e.dims,
        JSON.stringify(e.vector),
        e.content_hash,
        e.created_at,
        e.updated_at,
      );

      emit(db, "embedding.upserted", e.owner_id, {
        embedding_id: deterministicId,
        owner_type: e.owner_type,
        owner_id: e.owner_id,
      });
      return;
    }
    case "embedding.deleteByOwner": {
      const { owner_type, owner_id } = cmd;
      db.prepare(
        "DELETE FROM embeddings WHERE owner_type = ? AND owner_id = ?",
      ).run(owner_type, owner_id);

      emit(db, "embedding.deleted", owner_id, { owner_type, owner_id });
      return;
    }
    case "trace.emit": {
      insertTraceEvent(db, cmd.event);
      return;
    }
    case "isc.report.create": {
      const r = cmd.report;
      db.prepare(`
        INSERT INTO isc_reports (id, artifact_id, artifact_type, passed, criteria_results, anti_criteria_results, summary, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        r.id,
        r.artifactId,
        r.artifactType,
        r.passed ? 1 : 0,
        JSON.stringify(r.criteriaResults),
        JSON.stringify(r.antiCriteriaResults),
        r.summary,
        r.createdAt,
      );
      emit(db, "isc.report.created", r.artifactId, {
        report_id: r.id,
        artifact_id: r.artifactId,
        passed: r.passed,
      });
      return;
    }
    case "reflection.create": {
      const ref = cmd.reflection;
      db.prepare(`
        INSERT INTO reflections (
          id, job_id, workflow_id, timestamp, effort_level, artifact_type,
          criteria_count, criteria_passed, criteria_failed, within_budget,
          elapsed_percent, implied_sentiment, q1_self, q2_workflow, q3_system,
          version, isc_report_id, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ref.id,
        ref.jobId,
        ref.workflowId,
        ref.timestamp,
        ref.effortLevel,
        ref.artifactType,
        ref.criteriaCount,
        ref.criteriaPassed,
        ref.criteriaFailed,
        ref.withinBudget ? 1 : 0,
        ref.elapsedPercent,
        ref.impliedSentiment ?? null,
        ref.q1Self,
        ref.q2Workflow,
        ref.q3System,
        ref.version,
        ref.iscReportId ?? null,
        JSON.stringify({}),
      );
      emit(db, "reflection.created", ref.jobId, {
        reflection_id: ref.id,
        job_id: ref.jobId,
        workflow_id: ref.workflowId,
      });
      return;
    }
    case "prd.create": {
      // PRDs are stored as markdown files, not in database
      // This command is handled by PRDStorage
      emit(db, "prd.created", cmd.prd.artifactId, {
        prd_id: cmd.prd.id,
        artifact_id: cmd.prd.artifactId,
        status: cmd.prd.status,
      });
      return;
    }
    case "prd.update": {
      // PRDs are stored as markdown files
      emit(db, "prd.updated", cmd.id, {
        prd_id: cmd.id,
        patch: Object.keys(cmd.patch),
      });
      return;
    }
    case "prd.addLogEntry": {
      // PRDs are stored as markdown files
      emit(db, "prd.log_entry_added", cmd.id, {
        prd_id: cmd.id,
        iteration: cmd.entry.iteration,
      });
      return;
    }
    default:
      return;
  }
}

function emit(
  db: Database,
  type: string,
  aggregateId: string | null,
  payload: unknown,
) {
  const id = `de_${ulid()}`;
  db.prepare(`
    INSERT INTO domain_events (id,type,created_at,aggregate_id,payload_json,delivered)
    VALUES (?,?,?,?,?,0)
  `).run(id, type, nowIso(), aggregateId, JSON.stringify(payload ?? {}));
}

function insertTraceEvent(
  db: Database,
  event: {
    id?: string;
    trace_id: string;
    job_id?: string | null;
    workflow_id?: string | null;
    kind: string;
    message?: string | null;
    span_id?: string | null;
    parent_span_id?: string | null;
    status?: string | null;
    started_at?: string | null;
    ended_at?: string | null;
    duration_ms?: number | null;
    data?: Record<string, unknown>;
    created_at?: string;
  },
) {
  const id = event.id ?? `tr_${ulid()}`;
  const createdAt = event.created_at ?? nowIso();
  db.prepare(`
    INSERT INTO trace_events (
      id, trace_id, job_id, workflow_id, kind, message, span_id, parent_span_id,
      status, started_at, ended_at, duration_ms, data_json, created_at
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id,
    event.trace_id,
    event.job_id ?? null,
    event.workflow_id ?? null,
    event.kind,
    event.message ?? null,
    event.span_id ?? null,
    event.parent_span_id ?? null,
    event.status ?? null,
    event.started_at ?? null,
    event.ended_at ?? null,
    event.duration_ms ?? null,
    JSON.stringify(event.data ?? {}),
    createdAt,
  );
}
