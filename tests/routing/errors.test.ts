import { describe, expect, test } from "bun:test";
import { NoAvailableProviderError } from "../../src/routing/errors";

describe("routing errors", () => {
  test("NoAvailableProviderError sets name and message", () => {
    const err = new NoAvailableProviderError("llm");
    expect(err.name).toBe("NoAvailableProviderError");
    expect(err.message).toContain("llm");
  });
});
