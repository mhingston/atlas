const DEFAULT_SKILLS_PATHS = [".github/skills", "skills"];
const DEFAULT_AGENTS_PATHS = ["AGENTS.md"];

function parsePaths(value: string | undefined, defaults: string[]): string[] {
  if (!value) {
    return defaults;
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function resolveSkillPaths(): string[] {
  return parsePaths(process.env.ATLAS_SKILLS_PATHS, DEFAULT_SKILLS_PATHS);
}

export function resolveAgentsPaths(): string[] {
  return parsePaths(process.env.ATLAS_AGENTS_PATHS, DEFAULT_AGENTS_PATHS);
}

export function resolveAutoSkillsDefault(): boolean {
  const value = process.env.ATLAS_SKILLS_AUTO;
  if (value === "false") {
    return false;
  }
  if (value === "true") {
    return true;
  }
  return true;
}

export function resolveSkillContextLimit(): number | undefined {
  const raw = process.env.ATLAS_SKILLS_CONTEXT_MAX_CHARS;
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}
