import type { SinkPlugin, SourcePlugin, WorkflowPlugin } from "./types";

export class PluginRegistry {
  sources = new Map<string, SourcePlugin>();
  workflows = new Map<string, WorkflowPlugin>();
  sinks = new Map<string, SinkPlugin>();

  registerSource(p: SourcePlugin) {
    this.sources.set(p.id, p);
  }

  registerWorkflow(p: WorkflowPlugin) {
    this.workflows.set(p.id, p);
  }

  registerSink(p: SinkPlugin) {
    this.sinks.set(p.id, p);
  }

  getSource(id: string): SourcePlugin | undefined {
    return this.sources.get(id);
  }

  getWorkflow(id: string): WorkflowPlugin | undefined {
    return this.workflows.get(id);
  }

  getSink(id: string): SinkPlugin | undefined {
    return this.sinks.get(id);
  }
}
