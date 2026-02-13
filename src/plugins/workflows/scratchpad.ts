import { cosineSimilarity, normalizeVector } from "../../ai/embedding_runtime";
import { logInfo } from "../../core/logger";
import type { WorkflowPlugin } from "../types";

type OwnerType = "artifact" | "entity";
type ScratchpadInput = Record<string, unknown>;
type ScratchpadItem = {
  id: string;
  type: string;
  title: string;
  content: string;
  created_at: string;
  score?: number;
};
type ScratchpadResult = {
  text: string;
  title: string;
  topic: string | null;
  intent: string;
  query: string;
  ownerType: OwnerType;
  since: string;
  selectedIds: string[];
  llmProvider: string;
  llmUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

function cleanSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...[truncated]`;
}

function buildSince(daysBack: number): string {
  const ms = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

export async function generateScratchpad(
  ctx: Parameters<WorkflowPlugin["run"]>[0],
  input: ScratchpadInput,
): Promise<ScratchpadResult> {
  const topic = String(input.topic ?? "");
  const query = String(input.query ?? input.prompt ?? topic ?? "scratchpad");
  const intent = String(input.intent ?? "scratchpad");
  const constraints = Array.isArray(input.constraints)
    ? input.constraints.map(String)
    : [];
  const ownerType = (input.owner_type as OwnerType) ?? "artifact";
  const k = Math.min(Math.max(Number(input.k ?? 8), 1), 30);
  const limit = Math.min(Math.max(Number(input.limit ?? 200), k), 2000);
  const since = String(input.since ?? buildSince(14));
  const profile =
    (input.profile as "fast" | "balanced" | "quality") ?? "balanced";
  const maxItemChars = Math.min(
    Math.max(Number(input.max_item_chars ?? 600), 200),
    2000,
  );
  const artifactType = input.artifact_type
    ? String(input.artifact_type)
    : undefined;

  let items: ScratchpadItem[] = [];

  if (ctx.embeddings) {
    const allCandidates = ctx.repo.listEmbeddings({
      owner_type: ownerType,
      since,
      limit,
    });
    if (allCandidates.length > 0) {
      const queryEmbed = await ctx.embeddings.embedText({
        texts: [query],
        profile,
      });
      const queryVector = normalizeVector(queryEmbed.vectors[0] ?? []);
      const candidates = allCandidates.filter(
        (emb) => emb.dims === queryVector.length,
      );
      const scored = candidates.map((emb) => ({
        embedding: emb,
        score: cosineSimilarity(queryVector, emb.vector),
      }));
      scored.sort((a, b) => b.score - a.score);
      const topK = scored.slice(0, k);

      items = topK
        .map(({ embedding, score }) => {
          if (embedding.owner_type === "artifact") {
            const artifact = ctx.repo.getArtifact(embedding.owner_id);
            if (!artifact) return null;
            return {
              id: artifact.id,
              type: artifact.type,
              title: artifact.title ?? artifact.type,
              content: artifact.content_md ?? "",
              created_at: artifact.created_at,
              score,
            };
          }
          const entity = ctx.repo.getEntity(embedding.owner_id);
          if (!entity) return null;
          return {
            id: entity.id,
            type: entity.type,
            title: entity.title ?? entity.type,
            content: entity.url ?? "",
            created_at: entity.updated_at,
            score,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
    }
  }

  if (items.length === 0 && ownerType === "artifact") {
    const recentArtifacts = ctx.findArtifacts({
      type: artifactType,
      since,
      limit: k,
    });
    items = recentArtifacts.map((artifact) => ({
      id: artifact.id,
      type: artifact.type,
      title: artifact.title ?? artifact.type,
      content: artifact.content_md ?? "",
      created_at: artifact.created_at,
    }));
  }

  const context = items.length
    ? items
        .map((item) => {
          const snippet = truncate(cleanSnippet(item.content), maxItemChars);
          const score =
            item.score != null ? `Score: ${item.score.toFixed(3)}\n` : "";
          return [
            `[${item.id}] ${item.title}`,
            `Type: ${item.type}`,
            `Created: ${item.created_at}`,
            score.trimEnd(),
            snippet ? `Content: ${snippet}` : "Content: (empty)",
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n")
    : "No context items were found.";

  const prompt = [
    `Intent: ${intent}`,
    topic ? `Topic: ${topic}` : "",
    `Query: ${query}`,
    constraints.length > 0
      ? `Constraints:\n${constraints.map((c) => `- ${c}`).join("\n")}`
      : "",
    "",
    "Context:",
    context,
    "",
    "Create a structured scratchpad that includes:",
    "1) Working notes (facts, assumptions, open questions)",
    "2) Ideas or hypotheses",
    "3) Next steps",
    "Cite context with inline references like [artifact_id].",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await ctx.llm.generateText({
    system:
      "You are a careful thinking partner. Be concise, structured, and explicit about uncertainty. Use bullet lists when helpful.",
    prompt,
    temperature: 0.4,
    maxTokens: 1200,
  });

  return {
    text: result.text,
    title: topic ? `Scratchpad: ${topic}` : "Scratchpad",
    topic: topic || null,
    intent,
    query,
    ownerType,
    since,
    selectedIds: items.map((i) => i.id),
    llmProvider: result.provider,
    llmUsage: result.usage,
  };
}

/**
 * Reference workflow: scratchpad.v1
 *
 * Creates a structured scratchpad for ideation or synthesis using recent artifacts/entities.
 */
export const scratchpadWorkflow: WorkflowPlugin = {
  id: "scratchpad.v1",

  async run(ctx, input, jobId) {
    const result = await generateScratchpad(ctx, input);

    ctx.emitArtifact({
      type: "scratchpad.session.v1",
      job_id: jobId,
      title: result.title,
      content_md: result.text,
      data: {
        schema_version: "1",
        produced_by: "scratchpad.v1",
        intent: result.intent,
        topic: result.topic,
        query: result.query,
        owner_type: result.ownerType,
        since: result.since,
        selected_ids: result.selectedIds,
        llm_provider: result.llmProvider,
        llm_usage: result.llmUsage,
      },
    });

    logInfo("workflow.scratchpad.complete", {
      topic: result.topic,
      owner_type: result.ownerType,
      selected: result.selectedIds.length,
      provider: result.llmProvider,
    });
  },
};
