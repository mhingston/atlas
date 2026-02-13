import { describe, expect, test } from "bun:test";
import { createDefaultWorkflowPolicy } from "../../src/core/policy";
import { buildHarnessBackendRegistry } from "../../src/harness/factory";
import { getDefaultRoutingConfig } from "../../src/routing/config";

describe("harness factory", () => {
  test("buildHarnessBackendRegistry registers noop and configured harnesses", async () => {
    const policy = createDefaultWorkflowPolicy();
    const routingConfig = getDefaultRoutingConfig();

    routingConfig.harnesses = {
      "test-harness": {
        command: "echo",
        args_template: ["{goal}"],
        output_parsers: {
          text: { type: "stdout_all" },
        },
        timeout_ms: 1000,
      },
    };

    const registry = buildHarnessBackendRegistry(policy, routingConfig);
    expect(registry.get("noop")).toBeTruthy();
    expect(registry.get("test-harness")).toBeTruthy();
  });
});
