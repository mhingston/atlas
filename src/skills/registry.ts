import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { SkillDefinition, SkillRegistryConfig } from "./types";

const SKILL_FILE_NAME = "SKILL.md";

type FrontmatterParseResult = {
  data: Record<string, string | string[]>;
  body: string;
};

function parseFrontmatter(content: string): FrontmatterParseResult {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return { data: {}, body: content.trim() };
  }

  const lines = trimmed.split("\n");
  if (lines.length < 2) {
    return { data: {}, body: content.trim() };
  }

  let idx = 1;
  const data: Record<string, string | string[]> = {};
  let currentKey: string | null = null;
  let collectingList = false;

  for (; idx < lines.length; idx += 1) {
    const line = lines[idx];
    if (!line) {
      continue;
    }
    if (line.trim() === "---") {
      idx += 1;
      break;
    }

    if (!line.trim()) {
      continue;
    }

    if (line.startsWith("- ") && currentKey && collectingList) {
      const value = line.slice(2).trim();
      const existing = data[currentKey];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        data[currentKey] = [value];
      }
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      currentKey = null;
      collectingList = false;
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    currentKey = key;
    collectingList = value === "";
    if (value !== "") {
      data[key] = value;
    } else if (!data[key]) {
      data[key] = [];
    }
  }

  const body = lines.slice(idx).join("\n").trim();
  return { data, body };
}

function normalizeSkillName(name: string): string {
  return name.trim().toLowerCase();
}

async function readSkillFile(path: string): Promise<SkillDefinition | null> {
  try {
    const file = Bun.file(path);
    const content = await file.text();
    const { data, body } = parseFrontmatter(content);
    const rawName = String(data.name || "").trim();
    const name = rawName || path.split("/").slice(-2, -1)[0] || path;
    const description =
      typeof data.description === "string" ? data.description : undefined;
    const allowedToolsRaw =
      data["allowed-tools"] || data.allowed_tools || data.allowedTools;
    const allowedTools = Array.isArray(allowedToolsRaw)
      ? allowedToolsRaw.map((tool) => String(tool))
      : undefined;

    return {
      name,
      description,
      path,
      allowedTools,
      content: body,
      frontmatter: Object.keys(data).length > 0 ? data : undefined,
    };
  } catch {
    return null;
  }
}

async function findSkillFiles(basePath: string): Promise<string[]> {
  const results: string[] = [];
  const stack = [basePath];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let stats: Awaited<ReturnType<typeof stat>> | null = null;
    try {
      stats = await stat(current);
    } catch {
      continue;
    }

    if (stats.isFile()) {
      if (current.endsWith(`/${SKILL_FILE_NAME}`)) {
        results.push(current);
      }
      continue;
    }

    if (!stats.isDirectory()) {
      continue;
    }

    let entries: string[] = [];
    try {
      entries = await readdir(current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      stack.push(join(current, entry));
    }
  }

  return results;
}

export class SkillRegistry {
  private skills: Map<string, SkillDefinition>;

  constructor(skills: SkillDefinition[]) {
    this.skills = new Map(
      skills.map((skill) => [normalizeSkillName(skill.name), skill]),
    );
  }

  list(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  get(name: string): SkillDefinition | undefined {
    return this.skills.get(normalizeSkillName(name));
  }

  findMatches(text: string): SkillDefinition[] {
    const normalized = text.toLowerCase();
    return this.list().filter((skill) =>
      normalized.includes(normalizeSkillName(skill.name)),
    );
  }
}

export async function loadSkillRegistry(
  config: SkillRegistryConfig,
): Promise<SkillRegistry> {
  const skills: SkillDefinition[] = [];

  for (const rawPath of config.paths) {
    const basePath = resolve(process.cwd(), rawPath);
    const files = await findSkillFiles(basePath);
    for (const filePath of files) {
      const skill = await readSkillFile(filePath);
      if (skill) {
        skills.push(skill);
      }
    }
  }

  return new SkillRegistry(skills);
}
