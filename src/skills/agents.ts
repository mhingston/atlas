import { resolve } from "node:path";

export type AgentsFile = {
  path: string;
  content: string;
};

export async function loadAgentsFiles(paths: string[]): Promise<AgentsFile[]> {
  const files: AgentsFile[] = [];

  for (const rawPath of paths) {
    const resolvedPath = resolve(process.cwd(), rawPath);
    try {
      const file = Bun.file(resolvedPath);
      if (!(await file.exists())) {
        continue;
      }
      const content = (await file.text()).trim();
      if (!content) {
        continue;
      }
      files.push({ path: resolvedPath, content });
    } catch {}
  }

  return files;
}
