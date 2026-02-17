import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { logInfo } from "./logger";

const DB_PATH =
  process.env.ATLAS_DB_PATH || join(import.meta.dir, "../../data/atlas.db");

// Ensure the data directory exists before creating the database
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH, { create: true });

// Enable WAL mode
db.run("PRAGMA journal_mode = WAL");

function nowIso() {
  return new Date().toISOString();
}

export function runMigrations(database?: Database) {
  const targetDb = database || db;

  // Ensure schema_migrations table exists
  targetDb.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const migrationsDir = join(import.meta.dir, "../../migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // Lexicographic sort (001_, 002_, etc.)

  interface MigrationRow {
    version: string;
  }
  const applied = new Set(
    targetDb
      .query("SELECT version FROM schema_migrations")
      .all()
      .map((r) => (r as MigrationRow).version),
  );

  for (const file of files) {
    const version = file.replace(".sql", "");
    if (applied.has(version)) {
      logInfo("migrations.skip", { version });
      continue;
    }

    logInfo("migrations.apply_start", { version });
    const sql = readFileSync(join(migrationsDir, file), "utf-8");

    // Run migration in a transaction
    targetDb.transaction(() => {
      targetDb.run(sql);
      targetDb.run(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
        [version, nowIso()],
      );
    })();

    logInfo("migrations.apply_done", { version });
  }

  logInfo("migrations.up_to_date");
}
