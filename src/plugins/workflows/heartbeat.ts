import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { logInfo } from "../../core/logger";
import type { WorkflowPlugin } from "../types";

const DEFAULT_HEARTBEAT_PATH = "HEARTBEAT.md";

type HeartbeatInput = {
  prompt?: string;
  heartbeat_path?: string;
  indexEmbeddings?: boolean;
};

async function readHeartbeatFile(path: string): Promise<{
  content: string;
  updatedAt?: string;
  bytes?: number;
}> {
  try {
    const resolvedPath = resolve(process.cwd(), path);
    const fileStat = await stat(resolvedPath);
    const content = await readFile(resolvedPath, "utf-8");
    return {
      content,
      updatedAt: fileStat.mtime.toISOString(),
      bytes: fileStat.size,
    };
  } catch {
    return { content: "" };
  }
}

export const heartbeatWorkflow: WorkflowPlugin = {
  id: "heartbeat.v1",

  async run(ctx, input, jobId) {
    const payload = input as HeartbeatInput;
    const heartbeatPath = payload.heartbeat_path
      ? String(payload.heartbeat_path)
      : DEFAULT_HEARTBEAT_PATH;
    const promptOverride = payload.prompt ? String(payload.prompt) : undefined;
    const indexEmbeddings = payload.indexEmbeddings !== false;

    const heartbeatFile = await readHeartbeatFile(heartbeatPath);
    const heartbeatText = heartbeatFile.content.trim();

    const systemPrompt =
      "You run a heartbeat check. Review HEARTBEAT.md and summarize any tasks. If there is nothing actionable, respond with HEARTBEAT_OK.";
    const prompt =
      promptOverride ??
      [
        "HEARTBEAT.md content:",
        "",
        heartbeatText || "(empty)",
        "",
        "Provide a concise status update.",
      ].join("\n");

    const result = await ctx.llm.generateText({
      system: systemPrompt,
      prompt,
      temperature: 0.2,
      maxTokens: 500,
    });

    ctx.emitArtifact({
      type: "heartbeat.report.v1",
      job_id: jobId,
      title: `Heartbeat: ${heartbeatPath}`,
      content_md: result.text,
      data: {
        schema_version: "1.0",
        produced_by: "heartbeat.v1",
        heartbeat_path: heartbeatPath,
        heartbeat_updated_at: heartbeatFile.updatedAt ?? null,
        heartbeat_bytes: heartbeatFile.bytes ?? null,
        llm_provider: result.provider,
        llm_usage: result.usage,
      },
    });

    if (indexEmbeddings) {
      ctx.spawnJob("index.embeddings.v1", {
        owner_type: "artifact",
        limit: 200,
      });
      ctx.spawnJob("index.embeddings.v1", {
        owner_type: "entity",
        entity_type: "memory.file",
        entity_source: "memory.source",
        limit: 200,
      });
    }

    logInfo("workflow.heartbeat.complete", {
      heartbeat_path: heartbeatPath,
      provider: result.provider,
    });
  },
};
