import { describe, expect, test } from "bun:test";
import {
  PolicyError,
  createDefaultWorkflowPolicy,
  createUnrestrictedPolicy,
  createWorkflowPolicy,
} from "../../src/core/policy";

describe("Policy", () => {
  describe("DefaultPolicy", () => {
    test("should grant db:read by default", () => {
      const policy = createDefaultWorkflowPolicy();
      expect(policy.check("db:read")).toBe(true);
    });

    test("should grant llm:generate by default", () => {
      const policy = createDefaultWorkflowPolicy();
      expect(policy.check("llm:generate")).toBe(true);
    });

    test("should grant embeddings:generate by default", () => {
      const policy = createDefaultWorkflowPolicy();
      expect(policy.check("embeddings:generate")).toBe(true);
    });

    test("should deny db:write by default", () => {
      const policy = createDefaultWorkflowPolicy();
      expect(policy.check("db:write")).toBe(false);
    });

    test("should deny exec:* by default", () => {
      const policy = createDefaultWorkflowPolicy();
      expect(policy.check("exec:local")).toBe(false);
    });

    test("should deny fs:write:* by default", () => {
      const policy = createDefaultWorkflowPolicy();
      expect(policy.check("fs:write:/tmp")).toBe(false);
    });

    test("should throw PolicyError when required capability missing", () => {
      const policy = createDefaultWorkflowPolicy();
      expect(() => {
        policy.require("db:write");
      }).toThrow(PolicyError);
    });

    test("should not throw when required capability granted", () => {
      const policy = createDefaultWorkflowPolicy();
      expect(() => {
        policy.require("db:read");
      }).not.toThrow();
    });

    test("should support wildcard scopes", () => {
      const policy = createDefaultWorkflowPolicy();
      policy.grant("fs:read:*");

      expect(policy.check("fs:read:/tmp")).toBe(true);
      expect(policy.check("fs:read:/home")).toBe(true);
      expect(policy.check("fs:write:/tmp")).toBe(false);
    });

    test("should list all capabilities", () => {
      const policy = createDefaultWorkflowPolicy();
      const caps = policy.capabilities();

      expect(caps).toContain("db:read");
      expect(caps).toContain("llm:generate");
      expect(caps).toContain("embeddings:generate");
    });
  });

  describe("UnrestrictedPolicy", () => {
    test("should grant all capabilities", () => {
      const policy = createUnrestrictedPolicy();

      expect(policy.check("db:read")).toBe(true);
      expect(policy.check("db:write")).toBe(true);
      expect(policy.check("llm:generate")).toBe(true);
      expect(policy.check("embeddings:generate")).toBe(true);
      expect(policy.check("exec:local")).toBe(true);
      expect(policy.check("fs:write:/tmp")).toBe(true);
    });
  });

  describe("Declared workflow policy", () => {
    test("should fall back to default when no capabilities declared", () => {
      const policy = createWorkflowPolicy();
      expect(policy.check("db:read")).toBe(true);
      expect(policy.check("llm:generate")).toBe(true);
      expect(policy.check("embeddings:generate")).toBe(true);
    });

    test("should grant db:read plus declared capabilities only", () => {
      const policy = createWorkflowPolicy(["net:http"]);
      expect(policy.check("db:read")).toBe(true);
      expect(policy.check("net:http")).toBe(true);
      expect(policy.check("llm:generate")).toBe(false);
      expect(policy.check("embeddings:generate")).toBe(false);
    });
  });
});
