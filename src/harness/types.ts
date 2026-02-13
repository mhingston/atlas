/**
 * Harness Runtime: Agent/tool executor abstraction
 *
 * Harnesses are tool-executing agents (Codex, OpenCode, Claude Code, etc.)
 * that can read/write files, run commands, and produce diffs/plans.
 */

export type HarnessMode = "plan" | "propose" | "apply";

export type HarnessRunArgs = {
  harnessId?: string; // e.g. "codex-cli", "opencode", "claude-code" - optional for routing
  goal: string;
  cwd: string; // working directory
  contextPaths?: string[]; // files/dirs allowed
  mode?: HarnessMode; // default "propose"
  profile?: "fast" | "balanced" | "quality";
  tags?: string[];
  budget?: {
    maxMinutes?: number;
  };
};

export type HarnessOutput =
  | { type: "text"; title?: string; content: string }
  | { type: "diff"; title?: string; diff: string }
  | { type: "file"; path: string; content: string }
  | {
      type: "command_log";
      entries: Array<{
        cmd: string;
        exitCode?: number;
        out?: string;
        err?: string;
      }>;
    };

export type HarnessRunResult = {
  mode: HarnessMode;
  summary: string;
  outputs: HarnessOutput[];
  provider?: string;
  meta?: Record<string, unknown>;
};

export interface HarnessRuntime {
  runTask(args: HarnessRunArgs): Promise<HarnessRunResult>;
}
