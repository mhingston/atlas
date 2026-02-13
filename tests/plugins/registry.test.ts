import { beforeEach, describe, expect, test } from "bun:test";
import { PluginRegistry } from "../../src/plugins/registry";
import type {
  SinkPlugin,
  SourcePlugin,
  WorkflowPlugin,
} from "../../src/plugins/types";

describe("PluginRegistry", () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  describe("workflow registration", () => {
    test("should register workflow plugin", () => {
      const workflow: WorkflowPlugin = {
        id: "test.workflow.v1",
        async run(_ctx, _input, _jobId) {
          // Mock implementation
        },
      };

      registry.registerWorkflow(workflow);
      expect(registry.getWorkflow("test.workflow.v1")).toBe(workflow);
    });

    test("should retrieve registered workflow", () => {
      const workflow: WorkflowPlugin = {
        id: "test.workflow.v1",
        async run(_ctx, _input, _jobId) {},
      };

      registry.registerWorkflow(workflow);
      const retrieved = registry.getWorkflow("test.workflow.v1");

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe("test.workflow.v1");
    });

    test("should return undefined for non-existent workflow", () => {
      const result = registry.getWorkflow("nonexistent.v1");
      expect(result).toBeUndefined();
    });
  });

  describe("source registration", () => {
    test("should register source plugin", () => {
      const source: SourcePlugin = {
        id: "test.source",
        async sync(_ctx) {
          // Mock implementation
        },
      };

      registry.registerSource(source);
      expect(registry.getSource("test.source")).toBe(source);
    });

    test("should retrieve registered source", () => {
      const source: SourcePlugin = {
        id: "test.source",
        async sync(_ctx) {},
      };

      registry.registerSource(source);
      const retrieved = registry.getSource("test.source");

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe("test.source");
    });
  });

  describe("sink registration", () => {
    test("should register sink plugin", () => {
      const sink: SinkPlugin = {
        id: "test.sink",
        async handle(_event) {
          // Mock implementation
        },
      };

      registry.registerSink(sink);
      expect(registry.getSink("test.sink")).toBe(sink);
    });

    test("should retrieve registered sink", () => {
      const sink: SinkPlugin = {
        id: "test.sink",
        async handle(_event) {},
      };

      registry.registerSink(sink);
      const retrieved = registry.getSink("test.sink");

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe("test.sink");
    });
  });

  describe("plugin management", () => {
    test("should handle multiple plugins of same type", () => {
      const workflow1: WorkflowPlugin = {
        id: "workflow1.v1",
        async run(_ctx, _input, _jobId) {},
      };
      const workflow2: WorkflowPlugin = {
        id: "workflow2.v1",
        async run(_ctx, _input, _jobId) {},
      };

      registry.registerWorkflow(workflow1);
      registry.registerWorkflow(workflow2);

      expect(registry.getWorkflow("workflow1.v1")).toBe(workflow1);
      expect(registry.getWorkflow("workflow2.v1")).toBe(workflow2);
    });

    test("should allow overwriting existing plugin", () => {
      const workflow1: WorkflowPlugin = {
        id: "test.v1",
        async run(_ctx, _input, _jobId) {
          return { version: 1 };
        },
      };
      const workflow2: WorkflowPlugin = {
        id: "test.v1",
        async run(_ctx, _input, _jobId) {
          return { version: 2 };
        },
      };

      registry.registerWorkflow(workflow1);
      registry.registerWorkflow(workflow2);

      expect(registry.getWorkflow("test.v1")).toBe(workflow2);
    });
  });

  describe("sources map", () => {
    test("should expose sources as iterable map", () => {
      const source1: SourcePlugin = { id: "source1", async sync(_ctx) {} };
      const source2: SourcePlugin = { id: "source2", async sync(_ctx) {} };

      registry.registerSource(source1);
      registry.registerSource(source2);

      const sourceIds = Array.from(registry.sources.keys());
      expect(sourceIds).toContain("source1");
      expect(sourceIds).toContain("source2");
    });
  });
});
