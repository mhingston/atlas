import { expect, test } from "bun:test";

import { generateId, validateManifest } from "../src/index.js";

test("generateId prefixes ids", () => {
  const id = generateId("plugin");
  expect(id.startsWith("plugin_")).toBe(true);
});

test("validateManifest accepts required fields", () => {
  const manifest = validateManifest({
    id: "com.example.plugin",
    name: "Example Plugin",
    version: "1.0.0",
    apiVersion: "1.0",
    entry: "./dist/index.js",
  });
  expect(manifest.id).toBe("com.example.plugin");
});
