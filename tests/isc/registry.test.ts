import { beforeEach, describe, expect, it } from "bun:test";
import { ISCRegistry } from "../../src/isc/registry";
import type { ISCDefinition } from "../../src/isc/types";

const testISC: ISCDefinition = {
  artifactType: "test.artifact",
  version: "1.0.0",
  idealCriteria: [
    {
      id: "ISC-TEST-001",
      criterion: "Test criterion",
      priority: "CRITICAL",
      confidence: "EXPLICIT",
      verify: { type: "GREP", pattern: "test" },
    },
  ],
  antiCriteria: [],
  minCriteria: 1,
  scaleTier: "SIMPLE",
};

describe("ISCRegistry", () => {
  let registry: ISCRegistry;

  beforeEach(() => {
    registry = new ISCRegistry();
  });

  it("should register ISC definitions", () => {
    registry.register("test.artifact", testISC);
    expect(registry.hasCriteria("test.artifact")).toBe(true);
  });

  it("should retrieve ISC definitions", () => {
    registry.register("test.artifact", testISC);
    const retrieved = registry.getCriteria("test.artifact");
    expect(retrieved).toEqual(testISC);
  });

  it("should return undefined for unregistered types", () => {
    const result = registry.getCriteria("unknown.type");
    expect(result).toBeUndefined();
  });

  it("should list registered types", () => {
    registry.register("type1", testISC);
    registry.register("type2", testISC);
    const list = registry.listRegistered();
    expect(list).toContain("type1");
    expect(list).toContain("type2");
  });

  it("should unregister types", () => {
    registry.register("test.artifact", testISC);
    expect(registry.unregister("test.artifact")).toBe(true);
    expect(registry.hasCriteria("test.artifact")).toBe(false);
  });

  it("should clear all registrations", () => {
    registry.register("type1", testISC);
    registry.register("type2", testISC);
    registry.clear();
    expect(registry.listRegistered()).toHaveLength(0);
  });
});
