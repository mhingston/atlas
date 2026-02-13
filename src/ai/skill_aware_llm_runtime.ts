import type { SkillRegistry } from "../skills/registry";
import type {
  GenerateTextArgs,
  GenerateTextResult,
  LLMRuntime,
} from "./llm_runtime";

const DEFAULT_MAX_CONTEXT_CHARS = 24_000;

type SkillAwareConfig = {
  registry: SkillRegistry;
  agentsInstructions?: string;
  autoSkillsDefault?: boolean;
  maxContextChars?: number;
};

function renderSkillsSection(skills: Array<{ name: string; content: string }>) {
  if (skills.length === 0) {
    return "";
  }

  const sections = skills.map((skill) => {
    return `## ${skill.name}\n${skill.content}`.trim();
  });

  return `# Skills\n\n${sections.join("\n\n")}`;
}

function clampContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n[Context trimmed]`;
}

export class SkillAwareLLMRuntime implements LLMRuntime {
  constructor(
    private inner: LLMRuntime,
    private config: SkillAwareConfig,
  ) {}

  async generateText(args: GenerateTextArgs): Promise<GenerateTextResult> {
    const registry = this.config.registry;
    const autoSkills =
      args.autoSkills ?? this.config.autoSkillsDefault ?? false;

    const requestedSkills = new Set<string>(
      (args.skills ?? []).map((skill) => skill.toLowerCase()),
    );

    if (autoSkills) {
      const matches = registry.findMatches(
        `${args.system ?? ""}\n${args.prompt}`,
      );
      for (const match of matches) {
        requestedSkills.add(match.name.toLowerCase());
      }
    }

    const resolvedSkills = Array.from(requestedSkills)
      .map((name) => registry.get(name))
      .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill))
      .map((skill) => ({
        name: skill.name,
        content: skill.content,
      }));

    const agentsInstructions = this.config.agentsInstructions?.trim();

    const instructionBlocks: string[] = [];
    if (agentsInstructions) {
      instructionBlocks.push(`# AGENTS.md\n\n${agentsInstructions}`);
    }

    const skillsSection = renderSkillsSection(resolvedSkills);
    if (skillsSection) {
      instructionBlocks.push(skillsSection);
    }

    const maxContextChars =
      this.config.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;
    const injectedContext = instructionBlocks.length
      ? clampContext(
          [
            "",
            "[Instruction Context]",
            "",
            instructionBlocks.join("\n\n"),
            "",
            "[/Instruction Context]",
            "",
          ].join("\n"),
          maxContextChars,
        )
      : "";

    const mergedSystem = [args.system, injectedContext]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    const mergedTags = new Set(args.tags ?? []);
    if (agentsInstructions) {
      mergedTags.add("agents");
    }
    for (const skill of resolvedSkills) {
      mergedTags.add(`skill:${skill.name}`);
    }

    return this.inner.generateText({
      ...args,
      system: mergedSystem || undefined,
      tags: mergedTags.size > 0 ? Array.from(mergedTags) : undefined,
    });
  }
}
