export type SkillDefinition = {
  name: string;
  description?: string;
  path: string;
  allowedTools?: string[];
  content: string;
  frontmatter?: Record<string, string | string[]>;
};

export type SkillRegistryConfig = {
  paths: string[];
};
