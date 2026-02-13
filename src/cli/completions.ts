/**
 * Shell completion generators for Atlas CLI
 *
 * Usage:
 *   atlas completions bash >> ~/.bashrc
 *   atlas completions zsh >> ~/.zshrc
 *   atlas completions fish > ~/.config/fish/completions/atlas.fish
 */

const COMMANDS = [
  "status",
  "jobs",
  "artifacts",
  "search",
  "sync",
  "skills",
  "ops",
  "config",
];

const JOBS_SUBCOMMANDS = [
  "list",
  "show",
  "create",
  "approve",
  "deny",
  "trace",
  "timeline",
];

const ARTIFACTS_SUBCOMMANDS = ["list", "show"];
const SKILLS_SUBCOMMANDS = ["list", "show"];

const FLAGS: Record<string, string[]> = {
  "jobs list": ["--status=", "--workflow=", "--limit="],
  "jobs create": ["--input="],
  "artifacts list": ["--type=", "--limit="],
  search: ["--limit="],
};

const JOB_STATUSES = [
  "queued",
  "running",
  "verifying",
  "needs_approval",
  "succeeded",
  "failed",
];

const WORKFLOW_IDS = [
  "brainstorm.v1",
  "code.assist.v1",
  "code.pipeline.v1",
  "code.review.v1",
  "curate.artifacts.v1",
  "curate.merge.apply.v1",
  "curate.reconcile.apply.v1",
  "curate.reconcile.v2",
  "digest.daily.v1",
  "digest.weekly.v1",
  "heartbeat.v1",
  "index.embeddings.v1",
  "skills.inventory.v1",
  "scratchpad.v1",
  "scratchpad.review.v1",
];

function generateBashCompletion(): string {
  return `#!/bin/bash
# Atlas CLI Bash Completion
# Source this file or add to your .bashrc

_atlas_completions() {
  local cur=\${COMP_WORDS[COMP_CWORD]}
  local prev=\${COMP_WORDS[COMP_CWORD-1]}
  local cmd=\${COMP_WORDS[1]}
  local subcmd=\${COMP_WORDS[2]}

  # First level commands
  if [ $COMP_CWORD -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${COMMANDS.join(" ")} completions" -- "$cur") )
    return 0
  fi

  # Jobs subcommands
  if [ "$cmd" = "jobs" ] && [ $COMP_CWORD -eq 2 ]; then
    COMPREPLY=( $(compgen -W "${JOBS_SUBCOMMANDS.join(" ")}" -- "$cur") )
    return 0
  fi

  # Artifacts subcommands
  if [ "$cmd" = "artifacts" ] && [ $COMP_CWORD -eq 2 ]; then
    COMPREPLY=( $(compgen -W "${ARTIFACTS_SUBCOMMANDS.join(" ")}" -- "$cur") )
    return 0
  fi

  # Skills subcommands
  if [ "$cmd" = "skills" ] && [ $COMP_CWORD -eq 2 ]; then
    COMPREPLY=( $(compgen -W "${SKILLS_SUBCOMMANDS.join(" ")}" -- "$cur") )
    return 0
  fi

  # Flags completion
  if [[ "$cur" == --* ]]; then
    local context="$cmd $subcmd"
    context=$(echo "$context" | sed 's/ *$//')
    
    case "$context" in
      "jobs list")
        COMPREPLY=( $(compgen -W "${FLAGS["jobs list"]?.join(" ") ?? ""}" -- "$cur") )
        ;;
      "jobs create")
        COMPREPLY=( $(compgen -W "${FLAGS["jobs create"]?.join(" ") ?? ""}" -- "$cur") )
        ;;
      "artifacts list")
        COMPREPLY=( $(compgen -W "${FLAGS["artifacts list"]?.join(" ") ?? ""}" -- "$cur") )
        ;;
      "search")
        COMPREPLY=( $(compgen -W "${FLAGS.search?.join(" ") ?? ""}" -- "$cur") )
        ;;
    esac
    return 0
  fi

  # Value completion for flags
  if [[ "$prev" == "--status=" ]]; then
    COMPREPLY=( $(compgen -W "${JOB_STATUSES.join(" ")}" -- "$cur") )
    return 0
  fi

  if [[ "$prev" == "--workflow=" ]]; then
    COMPREPLY=( $(compgen -W "${WORKFLOW_IDS.join(" ")}" -- "$cur") )
    return 0
  fi

  # Job IDs completion (suggest placeholder)
  if [ "$cmd" = "jobs" ] && ([ "$subcmd" = "show" ] || [ "$subcmd" = "approve" ] || [ "$subcmd" = "deny" ] || [ "$subcmd" = "trace" ] || [ "$subcmd" = "timeline" ]); then
    if [ $COMP_CWORD -eq 3 ]; then
      # Could fetch actual job IDs from the API here
      COMPREPLY=()
    fi
    return 0
  fi

  return 0
}

complete -F _atlas_completions atlas
`;
}

function generateZshCompletion(): string {
  return `#compdef atlas
# Atlas CLI Zsh Completion

local curcontext="$curcontext" state line

_arguments -C \\
  '1: :->command' \\
  '2: :->subcommand' \\
  '*: :->args'

case "$state" in
  command)
    _describe 'command' '(${COMMANDS.map((c) => `"${c}:${c} command"`).join(" ")} "completions:Generate shell completions")'
    ;;
  subcommand)
    case "$line[1]" in
      jobs)
        _describe 'subcommand' '(${JOBS_SUBCOMMANDS.map((s) => `"${s}:${s} job"`).join(" ")})'
        ;;
      artifacts)
        _describe 'subcommand' '(${ARTIFACTS_SUBCOMMANDS.map((s) => `"${s}:${s} artifact"`).join(" ")})'
        ;;
      skills)
        _describe 'subcommand' '(${SKILLS_SUBCOMMANDS.map((s) => `"${s}:${s} skill"`).join(" ")})'
        ;;
    esac
    ;;
  args)
    case "$line[1]" in
      jobs)
        case "$line[2]" in
          list)
            _arguments \\
              '--status[Filter by status]:status:(${JOB_STATUSES.join(" ")})' \\
              '--workflow[Filter by workflow]:workflow:(${WORKFLOW_IDS.join(" ")})' \\
              '--limit[Limit results]:number:'
            ;;
          create)
            _arguments \\
              '--input[Job input as JSON]:json:'
            ;;
          show|approve|deny|trace|timeline)
            # Could fetch job IDs from API
            ;;
        esac
        ;;
      artifacts)
        case "$line[2]" in
          list)
            _arguments \\
              '--type[Filter by type]:type:' \\
              '--limit[Limit results]:number:'
            ;;
        esac
        ;;
      search)
        _arguments \\
          '--limit[Limit results]:number:'
        ;;
      skills)
        case "$line[2]" in
          list)
            _arguments
            ;;
          show)
            ;;
        esac
        ;;
    esac
    ;;
esac
`;
}

function generateFishCompletion(): string {
  const lines: string[] = [];

  // Main commands
  for (const cmd of COMMANDS) {
    lines.push(`complete -c atlas -n "__fish_use_subcommand" -a "${cmd}"`);
  }

  // Jobs subcommands
  for (const subcmd of JOBS_SUBCOMMANDS) {
    lines.push(
      `complete -c atlas -n "__fish_seen_subcommand_from jobs" -a "${subcmd}"`,
    );
  }

  // Artifacts subcommands
  for (const subcmd of ARTIFACTS_SUBCOMMANDS) {
    lines.push(
      `complete -c atlas -n "__fish_seen_subcommand_from artifacts" -a "${subcmd}"`,
    );
  }

  // Skills subcommands
  for (const subcmd of SKILLS_SUBCOMMANDS) {
    lines.push(
      `complete -c atlas -n "__fish_seen_subcommand_from skills" -a "${subcmd}"`,
    );
  }

  // Flags
  for (const [context, flags] of Object.entries(FLAGS)) {
    const [cmd, subcmd] = context.split(" ");
    for (const flag of flags) {
      const flagName = flag.replace("=", "");
      if (subcmd) {
        lines.push(
          `complete -c atlas -n "__fish_seen_subcommand_from ${cmd} ${subcmd}" -l ${flagName} -r`,
        );
      } else {
        lines.push(
          `complete -c atlas -n "__fish_seen_subcommand_from ${cmd}" -l ${flagName} -r`,
        );
      }
    }
  }

  // Job status values
  for (const status of JOB_STATUSES) {
    lines.push(
      `complete -c atlas -n "__fish_seen_subcommand_from jobs" -l status -a "${status}"`,
    );
  }

  // Workflow IDs
  for (const workflow of WORKFLOW_IDS) {
    lines.push(
      `complete -c atlas -n "__fish_seen_subcommand_from jobs" -l workflow -a "${workflow}"`,
    );
  }

  return lines.join("\n");
}

export function generateCompletion(shell: string): string {
  switch (shell) {
    case "bash":
      return generateBashCompletion();
    case "zsh":
      return generateZshCompletion();
    case "fish":
      return generateFishCompletion();
    default:
      throw new Error(`Unsupported shell: ${shell}`);
  }
}

export const SUPPORTED_SHELLS = ["bash", "zsh", "fish"];
