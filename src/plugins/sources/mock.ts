import { ulid } from "ulid";
import { logInfo } from "../../core/logger";
import type { SourcePlugin } from "../types";

/**
 * Mock source plugin that creates test entities.
 * Useful for testing and verification.
 */
export const mockSource: SourcePlugin = {
  id: "mock.source",

  async sync(ctx) {
    logInfo("source.mock.sync_start");

    const now = ctx.nowIso();

    // Create a few mock bookmark entities
    const bookmarks = [
      {
        id: `raindrop:bookmark:${ulid()}`,
        type: "raindrop.bookmark",
        source: "mock.source",
        title: "Understanding Personal AI Assistants",
        url: "https://example.com/ai-assistants",
        status: "active",
        updated_at: now,
        data: { tags: ["ai", "productivity"] },
      },
      {
        id: `raindrop:bookmark:${ulid()}`,
        type: "raindrop.bookmark",
        source: "mock.source",
        title: "Building Event-Driven Systems",
        url: "https://example.com/event-driven",
        status: "active",
        updated_at: now,
        data: { tags: ["architecture", "systems"] },
      },
      {
        id: `raindrop:bookmark:${ulid()}`,
        type: "raindrop.bookmark",
        source: "mock.source",
        title: "SQLite WAL Mode Best Practices",
        url: "https://example.com/sqlite-wal",
        status: "active",
        updated_at: now,
        data: { tags: ["database", "sqlite"] },
      },
    ];

    // Enqueue entity.upsert commands
    for (const bookmark of bookmarks) {
      ctx.commands.enqueue({
        type: "entity.upsert",
        entity: bookmark,
      });
    }

    logInfo("source.mock.sync_done", { entities: bookmarks.length });
  },
};
