/**
 * ConfigurableCLIHarness: Generic CLI harness configured via routing config
 *
 * Executes any CLI-based code assistant tool by reading configuration that defines:
 * - Command template to execute
 * - How to map Atlas harness args to CLI flags/args
 * - How to parse output (text, diffs, logs, files)
 * - Success/failure detection
 */

import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Policy } from "../../core/policy";
import type {
  HarnessDefinition,
  OutputParserConfig,
} from "../../routing/types";
import type {
  HarnessOutput,
  HarnessRunArgs,
  HarnessRunResult,
  HarnessRuntime,
} from "../types";

export class ConfigurableCLIHarness implements HarnessRuntime {
  constructor(
    private id: string,
    private config: HarnessDefinition,
    private policy: Policy,
  ) {}

  async runTask(args: HarnessRunArgs): Promise<HarnessRunResult> {
    // Enforce policy
    this.policy.require(`exec:${this.id}`, `CLI harness execution: ${this.id}`);
    this.policy.require(`fs:read:${args.cwd}`, "Harness file read access");

    if (args.mode === "apply") {
      this.policy.require(`fs:write:${args.cwd}`, "Harness file write access");
    }

    // Build command arguments
    const cmdArgs = this.buildArgs(args);

    // Execute command
    const { stdout, stderr, exitCode } = await this.executeCommand(
      this.config.command,
      cmdArgs,
      args.cwd,
      this.config.timeout_ms ?? 300000,
    );

    // Parse outputs
    const outputs = await this.parseOutputs(stdout, stderr, args.cwd);

    // Generate summary
    const summary = this.generateSummary(outputs, exitCode);

    return {
      mode: args.mode || "propose",
      summary,
      outputs,
      provider: this.id,
      meta: {
        command: this.config.command,
        exitCode,
        stderr: stderr.length > 0 ? stderr.substring(0, 500) : undefined,
      },
    };
  }

  private buildArgs(args: HarnessRunArgs): string[] {
    if (!this.config.args_template) {
      return [args.goal];
    }

    // Template variable mapping
    const vars: Record<string, string> = {
      goal: args.goal,
      cwd: args.cwd,
      mode: args.mode || "propose",
      profile: args.profile || "balanced",
    };

    // Replace template variables
    return this.config.args_template.map((arg) => {
      if (arg.startsWith("{") && arg.endsWith("}")) {
        const key = arg.slice(1, -1);
        return vars[key] || arg;
      }
      return arg;
    });
  }

  private executeCommand(
    command: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd,
        env: { ...process.env, ...this.config.env },
        shell: false,
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timeout =
        timeoutMs > 0
          ? setTimeout(() => {
              timedOut = true;
              proc.kill("SIGTERM");
              setTimeout(() => proc.kill("SIGKILL"), 5000);
            }, timeoutMs)
          : undefined;

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("error", (error) => {
        if (timeout) {
          clearTimeout(timeout);
        }
        reject(new Error(`Failed to execute ${command}: ${error.message}`));
      });

      proc.on("close", (code) => {
        if (timeout) {
          clearTimeout(timeout);
        }

        if (timedOut) {
          reject(new Error(`Command timed out after ${timeoutMs}ms`));
          return;
        }

        resolve({
          stdout,
          stderr,
          exitCode: code || 0,
        });
      });
    });
  }

  private async parseOutputs(
    stdout: string,
    stderr: string,
    cwd: string,
  ): Promise<HarnessOutput[]> {
    const outputs: HarnessOutput[] = [];

    if (!this.config.output_parsers) {
      // Default: return stdout as text
      if (stdout.trim()) {
        outputs.push({
          type: "text",
          content: stdout.trim(),
        });
      }
      return outputs;
    }

    // Parse diff
    if (this.config.output_parsers.diff) {
      const diff = await this.parseOutput(
        this.config.output_parsers.diff,
        stdout,
        stderr,
        cwd,
      );
      if (diff) {
        outputs.push({
          type: "diff",
          diff,
        });
      }
    }

    // Parse plan
    if (this.config.output_parsers.plan) {
      const plan = await this.parseOutput(
        this.config.output_parsers.plan,
        stdout,
        stderr,
        cwd,
      );
      if (plan) {
        outputs.push({
          type: "text",
          title: "Plan",
          content: plan,
        });
      }
    }

    // Parse text
    if (this.config.output_parsers.text) {
      const text = await this.parseOutput(
        this.config.output_parsers.text,
        stdout,
        stderr,
        cwd,
      );
      if (text) {
        outputs.push({
          type: "text",
          content: text,
        });
      }
    }

    // Default fallback if no outputs parsed
    if (outputs.length === 0 && stdout.trim()) {
      outputs.push({
        type: "text",
        content: stdout.trim(),
      });
    }

    return outputs;
  }

  private async parseOutput(
    parser: OutputParserConfig,
    stdout: string,
    _stderr: string,
    cwd: string,
  ): Promise<string | null> {
    switch (parser.type) {
      case "stdout_all":
        return stdout.trim() || null;

      case "stdout_section": {
        const startIdx = stdout.indexOf(parser.start_marker);
        if (startIdx === -1) return null;

        const afterStart = stdout.slice(startIdx);
        const endIdx = afterStart.indexOf(
          parser.end_marker,
          parser.start_marker.length,
        );

        if (endIdx === -1) {
          return afterStart.trim();
        }

        return afterStart.slice(0, endIdx + parser.end_marker.length).trim();
      }

      case "json_field": {
        try {
          const json = JSON.parse(stdout);
          const value = json[parser.field];
          return value ? String(value) : null;
        } catch {
          return null;
        }
      }

      case "file_glob": {
        try {
          const files = await readdir(cwd);
          const pattern = new RegExp(parser.pattern.replace(/\*/g, ".*"));
          const matchedFiles = files.filter((f) => pattern.test(f));

          if (matchedFiles.length === 0) return null;

          const contents = await Promise.all(
            matchedFiles.map(async (file) => {
              const content = await readFile(join(cwd, file), "utf-8");
              return `=== ${file} ===\n${content}`;
            }),
          );

          return contents.join("\n\n");
        } catch {
          return null;
        }
      }

      case "exit_code":
        return null; // Exit code is handled separately in meta

      default:
        return null;
    }
  }

  private generateSummary(outputs: HarnessOutput[], exitCode: number): string {
    if (exitCode !== 0) {
      return `Command failed with exit code ${exitCode}`;
    }

    const hasDiff = outputs.some((o) => o.type === "diff");
    const hasPlan = outputs.some(
      (o) => o.type === "text" && o.title === "Plan",
    );

    if (hasDiff && hasPlan) {
      return "Generated plan and proposed changes";
    }
    if (hasDiff) {
      return "Proposed changes";
    }
    if (hasPlan) {
      return "Generated plan";
    }
    if (outputs.length > 0) {
      return `Completed with ${outputs.length} output(s)`;
    }
    return "Completed successfully";
  }
}
