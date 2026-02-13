import { loadSkillRegistry, resolveSkillPaths } from "../../skills";
import type { WorkflowPlugin } from "../types";

type SkillsInventoryInput = {
  indexEmbeddings?: boolean;
};

export const skillsInventoryWorkflow: WorkflowPlugin = {
  id: "skills.inventory.v1",

  async run(ctx, input, jobId) {
    const payload = input as SkillsInventoryInput;
    const indexEmbeddings = payload.indexEmbeddings !== false;
    const registry = await loadSkillRegistry({ paths: resolveSkillPaths() });
    const skills = registry.list();

    const content = skills.length
      ? skills
          .map((skill) => {
            const desc = skill.description ? `\n\n${skill.description}` : "";
            const tools = skill.allowedTools?.length
              ? `\n\nAllowed tools: ${skill.allowedTools.join(", ")}`
              : "";
            return `## ${skill.name}\n\n${skill.content}${desc}${tools}`.trim();
          })
          .join("\n\n")
      : "No skills found.";

    ctx.emitArtifact({
      type: "skills.inventory.v1",
      job_id: jobId,
      title: "Skills Inventory",
      content_md: content,
      data: {
        schema_version: "1.0",
        produced_by: "skills.inventory.v1",
        skill_count: skills.length,
        paths: resolveSkillPaths(),
      },
    });

    if (indexEmbeddings) {
      ctx.spawnJob("index.embeddings.v1", {
        owner_type: "artifact",
        limit: 200,
      });
    }
  },
};
