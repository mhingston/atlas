#!/usr/bin/env bun
/**
 * Atlas CLI - Command-line interface for the Atlas Gateway
 *
 * Usage:
 *   atlas status                    # Check gateway status
 *   atlas chat <message>            # Chat with Atlas via OpenAI API
 *   atlas jobs list                 # List recent jobs
 *   atlas jobs show <id>            # Show job details
 *   atlas jobs create <workflow>    # Create a new job
 *   atlas jobs approve <id>         # Approve a checkpoint
 *   atlas jobs deny <id>            # Deny a checkpoint
 *   atlas artifacts list            # List artifacts
 *   atlas artifacts show <id>       # Show artifact details
 *   atlas search <query>            # Semantic search
 *   atlas sync                      # Trigger source sync
 *
 * Environment:
 *   ATLAS_URL - Gateway URL (default: http://localhost:3000)
 */

import { getClient } from "./client";
import {
  approveJob,
  batchApprove,
  batchDeny,
  batchRetry,
  chatCommand,
  createJob,
  denyJob,
  listArtifacts,
  listJobs,
  listSkills,
  search,
  showArtifact,
  showConfig,
  showJob,
  showJobTimeline,
  showJobTrace,
  showOpsDashboard,
  showSkill,
  status,
  sync,
} from "./commands";
import { SUPPORTED_SHELLS, generateCompletion } from "./completions";

function showHelp(): void {
  console.log(`Atlas CLI

Usage: atlas <command> [options]

Commands:
  status                           Check gateway health and recent jobs
  
  chat <message> [options]         Chat with Atlas via OpenAI API
            --model=<model>        Model to use (atlas-scratchpad, atlas-brainstorm, atlas-code)
            --conversation=<id>    Continue existing conversation
            --stream               Enable streaming response
  
  jobs list [options]              List jobs
            --status=<status>      Filter by status
            --workflow=<id>        Filter by workflow
            --limit=<n>            Limit results (default: 20)
  
  jobs show <id>                   Show job details
  
  jobs create <workflow> [input]   Create a new job
            --input='<json>'       Job input as JSON string
  
  jobs approve <id>                Approve a checkpoint
  
  jobs deny <id>                   Deny a checkpoint
  
  jobs trace <id>                  Show job execution trace
  
  jobs timeline <id>               Show job timeline (HTML)
  
  jobs batch approve [options]     Bulk approve jobs
            --status=<status>      Filter by status (default: needs_approval)
            --workflow=<id>        Filter by workflow
            --limit=<n>            Limit batch size (default: 50)
  
  jobs batch deny [options]        Bulk deny jobs
            --status=<status>      Filter by status (default: needs_approval)
            --workflow=<id>        Filter by workflow
            --limit=<n>            Limit batch size (default: 50)
  
  jobs batch retry [options]       Bulk retry failed jobs
            --status=<status>      Filter by status (default: failed)
            --workflow=<id>        Filter by workflow
            --limit=<n>            Limit batch size (default: 50)
  
  artifacts list [options]         List artifacts
               --type=<type>        Filter by type
               --limit=<n>          Limit results
  
  artifacts show <id>              Show artifact details
  
  search <query> [options]         Semantic search
         --limit=<n>               Limit results (default: 10)
  
  sync                             Trigger source sync

  skills list                      List available skills
  skills show <name>               Show skill details

  ops                              Show ops dashboard summary
  
  config                           Show configuration
  
  completions <shell>              Generate shell completions
                                   (bash, zsh, fish)

Environment:
  ATLAS_URL    Gateway URL (default: http://localhost:3000)

Examples:
  atlas status
  atlas jobs list --status=needs_approval
  atlas jobs create brainstorm.v1 --input='{"topic": "AI ethics"}'
  atlas jobs trace <job-id>
  atlas search "machine learning" --limit=5
`);
}

function parseArgs(args: string[]): {
  command: string[];
  flags: Record<string, string | boolean>;
  positional: string[];
} {
  const command: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (!arg) break;

    if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      if (eqIndex > 0) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        flags[key] = value;
      } else {
        const key = arg.slice(2);
        flags[key] = true;
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      flags[key] = true;
    } else if (command.length < 2) {
      command.push(arg);
    } else {
      positional.push(arg);
    }
    i++;
  }

  return { command, flags, positional };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (
    args.length === 0 ||
    args[0] === "help" ||
    args[0] === "--help" ||
    args[0] === "-h"
  ) {
    showHelp();
    process.exit(0);
  }

  const { command, flags, positional } = parseArgs(args);
  const client = getClient();

  try {
    const [cmd, subcmd] = command;

    switch (cmd) {
      case "status":
        await status(client);
        break;

      case "chat": {
        if (!positional[0]) {
          console.error("Error: Message required");
          process.exit(1);
        }
        const message = positional.join(" ");
        await chatCommand(client, message, {
          model: (flags.model as string) || "atlas-scratchpad",
          conversation: flags.conversation as string | undefined,
          stream: flags.stream === true,
        });
        break;
      }

      case "jobs":
        switch (subcmd) {
          case "list":
            await listJobs(client, {
              status: flags.status as string | undefined,
              workflow: flags.workflow as string | undefined,
              limit: flags.limit ? Number(flags.limit) : undefined,
            });
            break;

          case "show":
            if (!positional[0]) {
              console.error("Error: Job ID required");
              process.exit(1);
            }
            await showJob(client, positional[0]);
            break;

          case "create": {
            if (!positional[0]) {
              console.error("Error: Workflow ID required");
              process.exit(1);
            }
            let input: Record<string, unknown> = {};
            if (flags.input) {
              try {
                input = JSON.parse(flags.input as string);
              } catch {
                console.error("Error: Invalid JSON in --input");
                process.exit(1);
              }
            }
            await createJob(client, positional[0], input);
            break;
          }

          case "approve":
            if (!positional[0]) {
              console.error("Error: Job ID required");
              process.exit(1);
            }
            await approveJob(client, positional[0]);
            break;

          case "deny":
            if (!positional[0]) {
              console.error("Error: Job ID required");
              process.exit(1);
            }
            await denyJob(client, positional[0]);
            break;

          case "trace":
            if (!positional[0]) {
              console.error("Error: Job ID required");
              process.exit(1);
            }
            await showJobTrace(client, positional[0]);
            break;

          case "timeline":
            if (!positional[0]) {
              console.error("Error: Job ID required");
              process.exit(1);
            }
            await showJobTimeline(client, positional[0]);
            break;

          case "batch": {
            const batchCmd = positional[0];
            if (!batchCmd) {
              console.error(
                "Error: Batch subcommand required (approve, deny, retry)",
              );
              process.exit(1);
            }

            const batchOptions = {
              status: flags.status as string | undefined,
              workflow: flags.workflow as string | undefined,
              limit: flags.limit ? Number(flags.limit) : undefined,
            };

            switch (batchCmd) {
              case "approve":
                await batchApprove(client, batchOptions);
                break;
              case "deny":
                await batchDeny(client, batchOptions);
                break;
              case "retry":
                await batchRetry(client, batchOptions);
                break;
              default:
                console.error(`Unknown batch subcommand: ${batchCmd}`);
                showHelp();
                process.exit(1);
            }
            break;
          }

          default:
            console.error(`Unknown jobs subcommand: ${subcmd}`);
            showHelp();
            process.exit(1);
        }
        break;

      case "artifacts":
        switch (subcmd) {
          case "list":
            await listArtifacts(client, {
              type: flags.type as string | undefined,
              limit: flags.limit ? Number(flags.limit) : undefined,
            });
            break;

          case "show":
            if (!positional[0]) {
              console.error("Error: Artifact ID required");
              process.exit(1);
            }
            await showArtifact(client, positional[0]);
            break;

          default:
            console.error(`Unknown artifacts subcommand: ${subcmd}`);
            showHelp();
            process.exit(1);
        }
        break;

      case "search":
        if (!positional[0]) {
          console.error("Error: Search query required");
          process.exit(1);
        }
        await search(client, positional[0], {
          limit: flags.limit ? Number(flags.limit) : undefined,
        });
        break;

      case "sync":
        await sync(client);
        break;

      case "skills":
        switch (subcmd) {
          case "list":
            await listSkills(client);
            break;
          case "show":
            if (!positional[0]) {
              console.error("Error: Skill name required");
              process.exit(1);
            }
            await showSkill(client, positional[0]);
            break;
          default:
            console.error(`Unknown skills subcommand: ${subcmd ?? ""}`);
            process.exit(1);
        }
        break;

      case "ops":
        await showOpsDashboard(client);
        break;

      case "config":
        await showConfig();
        break;

      case "completions":
        if (!positional[0]) {
          console.error(
            `Error: Shell type required (${SUPPORTED_SHELLS.join(", ")})`,
          );
          process.exit(1);
        }
        try {
          const script = generateCompletion(positional[0]);
          console.log(script);
        } catch (err) {
          console.error(
            `Error: ${err instanceof Error ? err.message : String(err)}`,
          );
          process.exit(1);
        }
        break;

      default:
        console.error(`Unknown command: ${cmd}`);
        showHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
