import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import type { Entity, Event } from "../../core/types";
import type { SourcePlugin } from "../types";

const DEFAULT_MEMORY_PATHS = ["MEMORY.md", "memory"];

type MemoryFileEntry = {
  path: string;
  relPath: string;
  content: string;
  updatedAt: string;
  bytes: number;
  hash: string;
  title: string;
};

function resolveMemoryPaths(): string[] {
  const raw = process.env.ATLAS_MEMORY_PATHS;
  if (!raw) {
    return DEFAULT_MEMORY_PATHS;
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isMarkdown(path: string): boolean {
  return path.endsWith(".md") || path.endsWith(".markdown");
}

async function walkFiles(root: string, out: string[]) {
  let stats: Awaited<ReturnType<typeof stat>> | null = null;
  try {
    stats = await stat(root);
  } catch {
    return;
  }

  if (stats.isFile()) {
    if (isMarkdown(root)) {
      out.push(root);
    }
    return;
  }

  if (!stats.isDirectory()) {
    return;
  }

  let entries: string[] = [];
  try {
    entries = await readdir(root);
  } catch {
    return;
  }

  for (const entry of entries) {
    await walkFiles(join(root, entry), out);
  }
}

function deriveTitle(content: string, fallback: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith("#")) {
      return trimmed.replace(/^#+\s*/, "").trim() || fallback;
    }
    return trimmed.slice(0, 120);
  }
  return fallback;
}

async function buildEntry(filePath: string): Promise<MemoryFileEntry | null> {
  try {
    const fileStat = await stat(filePath);
    const content = await readFile(filePath, "utf-8");
    const hash = createHash("sha256").update(content).digest("hex");
    const relPath = relative(process.cwd(), filePath);
    const fallbackTitle = basename(filePath);
    return {
      path: filePath,
      relPath,
      content,
      updatedAt: fileStat.mtime.toISOString(),
      bytes: fileStat.size,
      hash,
      title: deriveTitle(content, fallbackTitle),
    };
  } catch {
    return null;
  }
}

async function listMemoryFiles(): Promise<MemoryFileEntry[]> {
  const paths = resolveMemoryPaths();
  const files: string[] = [];

  for (const rawPath of paths) {
    const target = resolve(process.cwd(), rawPath);
    await walkFiles(target, files);
  }

  const entries = await Promise.all(
    files.map((filePath) => buildEntry(filePath)),
  );
  return entries.filter((entry): entry is MemoryFileEntry => Boolean(entry));
}

function buildEntity(
  entry: MemoryFileEntry,
  status: "active" | "deleted",
): Entity {
  return {
    id: `memory:file:${entry.relPath}`,
    type: "memory.file",
    source: "memory.source",
    title: entry.title,
    url: null,
    status,
    updated_at: entry.updatedAt,
    data: {
      path: entry.relPath,
      bytes: entry.bytes,
      hash: entry.hash,
      content: entry.content,
      deleted_at: status === "deleted" ? new Date().toISOString() : null,
    },
  };
}

function buildEvent(params: {
  entryId: string;
  status: "active" | "deleted";
  timestamp: string;
  summary?: string;
  data?: Record<string, unknown>;
}): Event {
  const eventType =
    params.status === "deleted" ? "memory.file.deleted" : "memory.file.synced";
  const hashInput = [params.entryId, eventType, params.timestamp].join("|");
  const hash = createHash("sha256").update(hashInput).digest("hex");
  const id = `mem_${hash}`;
  return {
    id,
    entity_id: params.entryId,
    type: eventType,
    actor: "memory.source",
    created_at: params.timestamp,
    body: params.summary ?? null,
    data: params.data ?? {},
  };
}

export const memoryFilesSource: SourcePlugin = {
  id: "memory.source",

  async sync(ctx) {
    const entries = await listMemoryFiles();
    const activeIds = new Set(
      entries.map((entry) => `memory:file:${entry.relPath}`),
    );

    for (const entry of entries) {
      const entity = buildEntity(entry, "active");
      ctx.commands.enqueue({
        type: "entity.upsert",
        entity,
      });
      ctx.commands.enqueue({
        type: "event.insert",
        event: buildEvent({
          entryId: entity.id,
          status: "active",
          timestamp: entity.updated_at,
          summary: `Memory file synced: ${entry.relPath}`,
          data: {
            path: entry.relPath,
            bytes: entry.bytes,
            hash: entry.hash,
          },
        }),
      });
    }

    const existing = ctx.repo.listEntities({ source: "memory.source" });
    for (const existingEntity of existing) {
      if (activeIds.has(existingEntity.id)) {
        continue;
      }
      const relPath = String(
        existingEntity.data?.path ?? existingEntity.title ?? existingEntity.id,
      );
      const updatedAt = ctx.nowIso();
      const updatedEntity: Entity = {
        id: existingEntity.id,
        type: existingEntity.type,
        source: existingEntity.source,
        title: existingEntity.title,
        url: existingEntity.url ?? null,
        status: "deleted",
        updated_at: updatedAt,
        data: {
          ...(existingEntity.data ?? {}),
          path: relPath,
          deleted_at: updatedAt,
        },
      };
      ctx.commands.enqueue({
        type: "entity.upsert",
        entity: updatedEntity,
      });
      ctx.commands.enqueue({
        type: "event.insert",
        event: buildEvent({
          entryId: updatedEntity.id,
          status: "deleted",
          timestamp: updatedAt,
          summary: `Memory file removed: ${relPath}`,
          data: {
            path: relPath,
          },
        }),
      });
    }
  },
};
