import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultWorkflowPolicy } from "../../src/core/policy";
import type { Policy } from "../../src/core/policy";
import { ConfigurableCLIHarness } from "../../src/harness/impl/configurable_cli_harness";
import type { HarnessDefinition } from "../../src/routing/types";

describe("ConfigurableCLIHarness", () => {
  let tempDir: string;
  let policy: Policy;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "harness-test-"));
    policy = createDefaultWorkflowPolicy();
    // Grant necessary permissions
    policy.grant("exec:test-harness");
    policy.grant(`fs:read:${tempDir}`);
  });

  test("should execute simple command and capture stdout", async () => {
    const config: HarnessDefinition = {
      command: "echo",
      args_template: ["hello", "world"],
      output_parsers: {
        text: { type: "stdout_all" },
      },
      timeout_ms: 5000,
    };

    const harness = new ConfigurableCLIHarness("test-harness", config, policy);

    const result = await harness.runTask({
      goal: "test",
      cwd: tempDir,
      mode: "propose",
    });

    expect(result.provider).toBe("test-harness");
    expect(result.mode).toBe("propose");
    expect(result.outputs.length).toBeGreaterThan(0);
    expect(result.outputs[0].type).toBe("text");
    expect(result.outputs[0].content).toContain("hello world");
  });

  test("should substitute template variables", async () => {
    const config: HarnessDefinition = {
      command: "echo",
      args_template: ["Goal:", "{goal}", "Mode:", "{mode}"],
      output_parsers: {
        text: { type: "stdout_all" },
      },
      timeout_ms: 5000,
    };

    const harness = new ConfigurableCLIHarness("test-harness", config, policy);

    const result = await harness.runTask({
      goal: "my-task",
      cwd: tempDir,
      mode: "plan",
    });

    expect(result.outputs[0].content).toContain("my-task");
    expect(result.outputs[0].content).toContain("plan");
  });

  test("should respect timeout", async () => {
    const config: HarnessDefinition = {
      command: "sleep",
      args_template: ["10"],
      timeout_ms: 100, // Very short timeout
    };

    const harness = new ConfigurableCLIHarness("test-harness", config, policy);

    await expect(
      harness.runTask({
        goal: "test",
        cwd: tempDir,
        mode: "propose",
      }),
    ).rejects.toThrow("timed out");
  });

  test("should parse stdout sections", async () => {
    const config: HarnessDefinition = {
      command: "echo",
      args_template: ["START", "content", "here", "END"],
      output_parsers: {
        diff: {
          type: "stdout_section",
          start_marker: "START",
          end_marker: "END",
        },
      },
      timeout_ms: 5000,
    };

    const harness = new ConfigurableCLIHarness("test-harness", config, policy);

    const result = await harness.runTask({
      goal: "test",
      cwd: tempDir,
      mode: "propose",
    });

    const diffOutput = result.outputs.find((o) => o.type === "diff");
    expect(diffOutput).toBeDefined();
    expect(diffOutput?.diff).toContain("START");
  });

  test("should parse JSON output", async () => {
    // Create a test script that outputs JSON
    const scriptPath = join(tempDir, "test.sh");
    writeFileSync(
      scriptPath,
      '#!/bin/bash\necho \'{"changes": "some diff content", "plan": "some plan"}\'\n',
      { mode: 0o755 },
    );

    const config: HarnessDefinition = {
      command: scriptPath,
      args_template: [],
      output_parsers: {
        diff: { type: "json_field", field: "changes" },
        plan: { type: "json_field", field: "plan" },
      },
      timeout_ms: 5000,
    };

    const harness = new ConfigurableCLIHarness("test-harness", config, policy);

    const result = await harness.runTask({
      goal: "test",
      cwd: tempDir,
      mode: "propose",
    });

    const diffOutput = result.outputs.find((o) => o.type === "diff");
    const planOutput = result.outputs.find(
      (o) => o.type === "text" && o.title === "Plan",
    );

    expect(diffOutput).toBeDefined();
    expect(diffOutput?.diff).toBe("some diff content");
    expect(planOutput).toBeDefined();
    expect(planOutput?.content).toBe("some plan");
  });

  test("should enforce policy for execution", async () => {
    const restrictedPolicy = createDefaultWorkflowPolicy();
    // Don't grant exec permission

    const config: HarnessDefinition = {
      command: "echo",
      args_template: ["test"],
      timeout_ms: 5000,
    };

    const harness = new ConfigurableCLIHarness(
      "test-harness",
      config,
      restrictedPolicy,
    );

    await expect(
      harness.runTask({
        goal: "test",
        cwd: tempDir,
        mode: "propose",
      }),
    ).rejects.toThrow("exec:test-harness");
  });

  test("should enforce policy for file write in apply mode", async () => {
    const restrictedPolicy = createDefaultWorkflowPolicy();
    restrictedPolicy.grant("exec:test-harness");
    restrictedPolicy.grant(`fs:read:${tempDir}`);
    // Don't grant fs:write

    const config: HarnessDefinition = {
      command: "echo",
      args_template: ["test"],
      timeout_ms: 5000,
    };

    const harness = new ConfigurableCLIHarness(
      "test-harness",
      config,
      restrictedPolicy,
    );

    await expect(
      harness.runTask({
        goal: "test",
        cwd: tempDir,
        mode: "apply", // Requires write permission
      }),
    ).rejects.toThrow("fs:write");
  });

  test("should include exit code in metadata", async () => {
    const config: HarnessDefinition = {
      command: "false", // Command that always fails
      args_template: [],
      timeout_ms: 5000,
    };

    const harness = new ConfigurableCLIHarness("test-harness", config, policy);

    const result = await harness.runTask({
      goal: "test",
      cwd: tempDir,
      mode: "propose",
    });

    expect(result.meta?.exitCode).toBe(1);
    expect(result.summary).toContain("exit code 1");
  });

  test("should use default stdout parser when none configured", async () => {
    const config: HarnessDefinition = {
      command: "echo",
      args_template: ["default output"],
      timeout_ms: 5000,
      // No output_parsers configured
    };

    const harness = new ConfigurableCLIHarness("test-harness", config, policy);

    const result = await harness.runTask({
      goal: "test",
      cwd: tempDir,
      mode: "propose",
    });

    expect(result.outputs.length).toBe(1);
    expect(result.outputs[0].type).toBe("text");
    expect(result.outputs[0].content).toContain("default output");
  });
});
