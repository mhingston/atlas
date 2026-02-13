import { describe, expect, test } from "bun:test";
import { log, logError, logInfo, logWarn } from "../../src/core/logger";

describe("logger", () => {
  test("serializes records with error data", () => {
    const originalLog = console.log;
    const captured: string[] = [];
    console.log = (line: string) => {
      captured.push(line);
    };

    try {
      logInfo("hello", { err: new Error("boom"), extra: 42 });
    } finally {
      console.log = originalLog;
    }

    expect(captured).toHaveLength(1);
    const record = JSON.parse(captured[0] ?? "{}");
    expect(record.level).toBe("info");
    expect(record.message).toBe("hello");
    expect(record.extra).toBe(42);
    expect(record.err.message).toBe("boom");
    expect(record.err.name).toBe("Error");
  });

  test("routes to warn and error channels", () => {
    const originalWarn = console.warn;
    const originalError = console.error;
    const warnLines: string[] = [];
    const errorLines: string[] = [];
    console.warn = (line: string) => warnLines.push(line);
    console.error = (line: string) => errorLines.push(line);

    try {
      logWarn("heads up");
      logError("bad news");
    } finally {
      console.warn = originalWarn;
      console.error = originalError;
    }

    expect(warnLines).toHaveLength(1);
    expect(errorLines).toHaveLength(1);
    expect(JSON.parse(warnLines[0] ?? "{}").level).toBe("warn");
    expect(JSON.parse(errorLines[0] ?? "{}").level).toBe("error");
  });

  test("log uses correct channel", () => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const lines: string[] = [];
    console.log = (line: string) => lines.push(`log:${line}`);
    console.warn = (line: string) => lines.push(`warn:${line}`);
    console.error = (line: string) => lines.push(`error:${line}`);

    try {
      log("info", "info-msg");
      log("warn", "warn-msg");
      log("error", "error-msg");
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }

    expect(lines).toHaveLength(3);
    expect(lines[0]?.startsWith("log:")).toBe(true);
    expect(lines[1]?.startsWith("warn:")).toBe(true);
    expect(lines[2]?.startsWith("error:")).toBe(true);
  });
});
