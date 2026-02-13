import { createServer } from "./api/server";
import { db, runMigrations } from "./core/db";
import { logError, logInfo } from "./core/logger";
import { CommandQueue } from "./core/queue";
import { ReadOnlyRepo } from "./core/repo";
import { Writer } from "./core/writer";
import { FlushLoop } from "./jobs/loop";
import { Scheduler } from "./jobs/scheduler";
import { loadPluginConfig } from "./plugins/external/config";
import { ExternalPluginRuntime } from "./plugins/external/runtime";
import { PluginRegistry } from "./plugins/registry";

import { logSink } from "./plugins/sinks/log";
import { memoryFilesSource } from "./plugins/sources/memory_files";
import { mockSource } from "./plugins/sources/mock";
// Import plugins
import { brainstormWorkflow } from "./plugins/workflows/brainstorm";
import { codeAssistWorkflow } from "./plugins/workflows/code_assist";
import { codePipelineWorkflow } from "./plugins/workflows/code_pipeline";
import { codeReviewWorkflow } from "./plugins/workflows/code_review";
import { curateArtifactsWorkflow } from "./plugins/workflows/curate_artifacts";
import { curateMergeApplyWorkflow } from "./plugins/workflows/curate_merge_apply";
import { curateReconcileWorkflow } from "./plugins/workflows/curate_reconcile";
import { curateReconcileApplyWorkflow } from "./plugins/workflows/curate_reconcile_apply";
import { digestDailyWorkflow } from "./plugins/workflows/digest_daily";
import { digestWeeklyWorkflow } from "./plugins/workflows/digest_weekly";
import { heartbeatWorkflow } from "./plugins/workflows/heartbeat";
import { indexEmbeddingsWorkflow } from "./plugins/workflows/index_embeddings";
import { scratchpadWorkflow } from "./plugins/workflows/scratchpad";
import { scratchpadReviewWorkflow } from "./plugins/workflows/scratchpad_review";
import { skillsInventoryWorkflow } from "./plugins/workflows/skills_inventory";

async function main() {
  logInfo("atlas.starting");

  // 1. Run database migrations
  logInfo("atlas.migrations.start");
  runMigrations();

  // 2. Initialize core components
  const writer = new Writer(db);
  const commands = new CommandQueue();
  const repo = new ReadOnlyRepo(db);
  const registry = new PluginRegistry();
  const externalRuntime = new ExternalPluginRuntime(registry);

  // 3. Register plugins
  logInfo("atlas.plugins.register");
  registry.registerWorkflow(brainstormWorkflow);
  registry.registerWorkflow(codeAssistWorkflow);
  registry.registerWorkflow(codePipelineWorkflow);
  registry.registerWorkflow(codeReviewWorkflow);
  registry.registerWorkflow(digestDailyWorkflow);
  registry.registerWorkflow(digestWeeklyWorkflow);
  registry.registerWorkflow(indexEmbeddingsWorkflow);
  registry.registerWorkflow(curateArtifactsWorkflow);
  registry.registerWorkflow(curateMergeApplyWorkflow);
  registry.registerWorkflow(curateReconcileApplyWorkflow);
  registry.registerWorkflow(curateReconcileWorkflow);
  registry.registerWorkflow(scratchpadWorkflow);
  registry.registerWorkflow(scratchpadReviewWorkflow);
  registry.registerWorkflow(heartbeatWorkflow);
  registry.registerWorkflow(skillsInventoryWorkflow);
  registry.registerSource(mockSource);
  registry.registerSource(memoryFilesSource);
  registry.registerSink(logSink);

  // 3.5 Load external plugins
  const externalConfigs = loadPluginConfig();
  await externalRuntime.loadAll(externalConfigs);

  // 4. Start flush loop (owns the writer)
  const flushLoop = new FlushLoop(commands, writer, 100);
  flushLoop.start();

  // 5. Start scheduler
  const scheduler = new Scheduler(registry, repo, commands, 5000);
  scheduler.start();

  // 6. Start HTTP server
  const port = process.env.PORT || 3000;
  const _server = createServer(registry, repo, commands, flushLoop);

  logInfo("atlas.ready", {
    url: `http://localhost:${port}`,
    llm_provider: process.env.ATLAS_LLM_PROVIDER || "mock",
    harness:
      process.env.ATLAS_HARNESS_ENABLED === "true" ? "enabled" : "disabled",
    database: process.env.ATLAS_DB_PATH || "data/atlas.db",
  });

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    logInfo("atlas.shutdown");
    scheduler.stop();
    flushLoop.stop();
    flushLoop.flushOnce(); // Flush remaining commands
    void externalRuntime.shutdownAll();
    db.close();
    process.exit(0);
  });
}

main().catch((error) => {
  logError("atlas.fatal", { error });
  process.exit(1);
});
