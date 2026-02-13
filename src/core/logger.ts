export type LogLevel = "info" | "warn" | "error";

export type LogData = Record<string, unknown>;

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }
  return error;
}

function toRecord(data?: LogData) {
  if (!data) return {};
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Error) {
      next[key] = normalizeError(value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

export function log(level: LogLevel, message: string, data?: LogData) {
  const record = {
    ts: new Date().toISOString(),
    level,
    message,
    ...toRecord(data),
  };
  const line = JSON.stringify(record);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function logInfo(message: string, data?: LogData) {
  log("info", message, data);
}

export function logWarn(message: string, data?: LogData) {
  log("warn", message, data);
}

export function logError(message: string, data?: LogData) {
  log("error", message, data);
}
