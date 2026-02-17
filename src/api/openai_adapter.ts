/**
 * OpenAI-compatible API adapter for Atlas
 *
 * Maps OpenAI chat completion requests to Atlas workflows
 * and returns responses in OpenAI format.
 */

import { ulid } from "ulid";
import type { CommandQueue } from "../core/queue";
import type { ReadOnlyRepo } from "../core/repo";
import type { Job, JobStatus } from "../core/types";

// Conversation memory store (in-memory, can be persisted to DB later)
export interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: string;
}

interface Conversation {
  id: string;
  messages: ConversationMessage[];
  created_at: string;
  updated_at: string;
}

const conversationStore = new Map<string, Conversation>();
const MAX_CONVERSATION_MESSAGES = 20; // Keep last 20 messages

// OpenAI API types
export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  tools?: unknown[];
  tool_choice?: unknown;
  user?: string;
  conversation_id?: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter";
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatCompletionStreamChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: "assistant";
      content?: string;
    };
    finish_reason: null | "stop" | "length" | "tool_calls" | "content_filter";
  }[];
}

export interface ModelInfo {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}

export interface ModelsResponse {
  object: "list";
  data: ModelInfo[];
}

// Available Atlas workflows mapped to "models"
const WORKFLOW_MODELS: ModelInfo[] = [
  {
    id: "atlas-scratchpad",
    object: "model",
    created: 1704067200,
    owned_by: "atlas",
  },
  {
    id: "atlas-brainstorm",
    object: "model",
    created: 1704067200,
    owned_by: "atlas",
  },
  {
    id: "atlas-code",
    object: "model",
    created: 1704067200,
    owned_by: "atlas",
  },
];

/**
 * Determine the workflow and construct input from chat messages
 */
function mapMessagesToWorkflow(
  messages: ChatCompletionMessage[],
  model: string,
  conversationContext?: string,
): { workflowId: string; input: Record<string, unknown> } {
  // Extract the last user message as the primary query/topic
  const userMessages = messages.filter((m) => m.role === "user");
  const lastUserMessage = userMessages[userMessages.length - 1];
  const query = lastUserMessage?.content || "";

  // Check for code-related keywords
  const isCodeRequest =
    query.toLowerCase().includes("code") ||
    query.toLowerCase().includes("function") ||
    query.toLowerCase().includes("implement") ||
    query.toLowerCase().includes("refactor");

  // Check for brainstorming keywords
  const isBrainstormRequest =
    query.toLowerCase().includes("brainstorm") ||
    query.toLowerCase().includes("ideas") ||
    query.toLowerCase().includes("generate ideas");

  // Determine workflow based on model or content
  let workflowId: string;
  let input: Record<string, unknown>;

  if (model === "atlas-code" || isCodeRequest) {
    workflowId = "code.assist.v1";
    input = {
      goal: query,
      mode: "propose",
    };
  } else if (model === "atlas-brainstorm" || isBrainstormRequest) {
    workflowId = "brainstorm.v1";
    input = {
      topic: query,
    };
  } else {
    // Default to scratchpad for synthesis
    workflowId = "scratchpad.v1";
    input = {
      topic: query.slice(0, 100), // First 100 chars as topic
      query: query,
      intent: "synthesis",
      owner_type: "artifact",
      k: 8,
    };
  }

  // Include conversation context if available
  if (conversationContext) {
    input = {
      ...input,
      conversation_context: conversationContext,
    };
  }

  return { workflowId, input };
}

/**
 * Wait for a job to complete
 */
async function waitForJobCompletion(
  repo: ReadOnlyRepo,
  jobId: string,
  timeoutMs = 120000,
  pollIntervalMs = 500,
): Promise<Job> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const job = repo.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Terminal states
    if (
      job.status === "succeeded" ||
      job.status === "failed" ||
      job.status === "needs_approval"
    ) {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Job ${jobId} timed out after ${timeoutMs}ms`);
}

/**
 * Extract response content from job artifacts
 */
function extractArtifactContent(repo: ReadOnlyRepo, jobId: string): string {
  const artifacts = repo.findArtifacts({ jobId, limit: 10 });

  if (artifacts.length === 0) {
    return "No response generated.";
  }

  // Find the main content artifact
  const contentArtifact =
    artifacts.find((a) =>
      ["scratchpad.session.v1", "brainstorm.session.v1"].includes(a.type),
    ) ||
    artifacts.find((a) => a.type.startsWith("code.summary.v1")) ||
    artifacts.find((a) => a.content_md) ||
    artifacts[0];

  if (!contentArtifact) {
    return "Unable to extract response content.";
  }

  let content = contentArtifact.content_md || "";

  // For code workflows, also include any patches or plans
  if (contentArtifact.type.startsWith("code.")) {
    const codeArtifacts = artifacts.filter(
      (a) =>
        a.type.startsWith("code.plan.v1") ||
        a.type.startsWith("code.patch.v1") ||
        a.type.startsWith("code.file.v1"),
    );

    if (codeArtifacts.length > 0) {
      content += "\n\n---\n\n**Generated Artifacts:**\n";
      for (const artifact of codeArtifacts) {
        content += `\n### ${artifact.title || "Artifact"}\n`;
        content += artifact.content_md || "(no content)";
      }
    }
  }

  return content || "Response completed but no content was generated.";
}

/**
 * Create a chat completion (non-streaming)
 */
export async function createChatCompletion(
  request: ChatCompletionRequest,
  commands: CommandQueue,
  repo: ReadOnlyRepo,
  flushCommands?: () => void,
): Promise<ChatCompletionResponse> {
  // Get or create conversation
  const conversation = getOrCreateConversation(request.conversation_id);
  const conversationId = conversation.id;

  // Get conversation context
  const conversationContext = getConversationContext(conversationId, 10);

  const { workflowId, input } = mapMessagesToWorkflow(
    request.messages,
    request.model,
    conversationContext,
  );

  // Add user message to conversation
  const lastUserMessage = request.messages
    .filter((m) => m.role === "user")
    .pop();
  if (lastUserMessage) {
    addMessageToConversation(conversationId, "user", lastUserMessage.content);
  }

  // Create the job
  const jobId = `job_${ulid()}`;
  commands.enqueue({
    type: "job.create",
    job: {
      id: jobId,
      workflow_id: workflowId,
      input: {
        ...input,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
      },
    },
  });

  // Flush commands to ensure job is created before waiting
  if (flushCommands) {
    flushCommands();
  }

  // Wait for completion
  const job = await waitForJobCompletion(repo, jobId);

  // Extract content
  let content: string;
  let finishReason: "stop" | "length" | "tool_calls" | "content_filter" =
    "stop";

  if (job.status === "succeeded") {
    content = extractArtifactContent(repo, jobId);
  } else if (job.status === "needs_approval") {
    content =
      "This request requires approval. Please check the Atlas approvals dashboard.";
    finishReason = "content_filter";
  } else {
    content = `Job failed with status: ${job.status}. Check job logs for details.`;
    finishReason = "stop";
  }

  // Add assistant response to conversation
  addMessageToConversation(conversationId, "assistant", content);

  return {
    id: jobId,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: request.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
        },
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: estimateTokens(JSON.stringify(request.messages)),
      completion_tokens: estimateTokens(content),
      total_tokens:
        estimateTokens(JSON.stringify(request.messages)) +
        estimateTokens(content),
    },
  };
}

/**
 * Create a streaming chat completion
 */
export async function* createChatCompletionStream(
  request: ChatCompletionRequest,
  commands: CommandQueue,
  repo: ReadOnlyRepo,
): AsyncGenerator<ChatCompletionStreamChunk, void, unknown> {
  // Get or create conversation
  const conversation = getOrCreateConversation(request.conversation_id);
  const conversationId = conversation.id;

  // Get conversation context
  const conversationContext = getConversationContext(conversationId, 10);

  const { workflowId, input } = mapMessagesToWorkflow(
    request.messages,
    request.model,
    conversationContext,
  );

  // Add user message to conversation
  const lastUserMessage = request.messages
    .filter((m) => m.role === "user")
    .pop();
  if (lastUserMessage) {
    addMessageToConversation(conversationId, "user", lastUserMessage.content);
  }

  const jobId = `job_${ulid()}`;
  const created = Math.floor(Date.now() / 1000);

  // Create the job
  commands.enqueue({
    type: "job.create",
    job: {
      id: jobId,
      workflow_id: workflowId,
      input: {
        ...input,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
      },
    },
  });

  // Yield initial role message
  yield {
    id: jobId,
    object: "chat.completion.chunk",
    created,
    model: request.model,
    choices: [
      {
        index: 0,
        delta: { role: "assistant" },
        finish_reason: null,
      },
    ],
  };

  // Wait for completion with progress updates
  const startTime = Date.now();
  const timeoutMs = 120000;
  let lastStatus: JobStatus | null = null;
  let progressDots = 0;

  while (Date.now() - startTime < timeoutMs) {
    const job = repo.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Status changed - emit progress
    if (job.status !== lastStatus) {
      lastStatus = job.status;

      if (job.status === "running") {
        yield {
          id: jobId,
          object: "chat.completion.chunk",
          created,
          model: request.model,
          choices: [
            {
              index: 0,
              delta: { content: "⏳ Processing request...\n" },
              finish_reason: null,
            },
          ],
        };
      }
    }

    // Terminal states
    if (
      job.status === "succeeded" ||
      job.status === "failed" ||
      job.status === "needs_approval"
    ) {
      break;
    }

    // Emit progress dots while waiting
    progressDots = (progressDots + 1) % 4;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Extract final content
  const job = repo.getJob(jobId);
  let content: string;
  let finishReason: "stop" | "length" | "tool_calls" | "content_filter" =
    "stop";

  if (!job || Date.now() - startTime >= timeoutMs) {
    content = "Request timed out.";
    finishReason = "length";
  } else if (job.status === "succeeded") {
    content = extractArtifactContent(repo, jobId);
  } else if (job.status === "needs_approval") {
    content =
      "\n\n---\n\n⚠️ This request requires approval. Please check the Atlas approvals dashboard.";
    finishReason = "content_filter";
  } else {
    content = `\n\n---\n\n❌ Job failed with status: ${job.status}. Check job logs for details.`;
    finishReason = "stop";
  }

  // Yield content in chunks to simulate streaming
  const chunkSize = 100;
  for (let i = 0; i < content.length; i += chunkSize) {
    const chunk = content.slice(i, i + chunkSize);
    yield {
      id: jobId,
      object: "chat.completion.chunk",
      created,
      model: request.model,
      choices: [
        {
          index: 0,
          delta: { content: chunk },
          finish_reason: null,
        },
      ],
    };
  }

  // Add assistant response to conversation
  addMessageToConversation(conversationId, "assistant", content);

  // Yield final stop
  yield {
    id: jobId,
    object: "chat.completion.chunk",
    created,
    model: request.model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: finishReason,
      },
    ],
  };
}

/**
 * Get list of available models
 */
export function getModels(): ModelsResponse {
  return {
    object: "list",
    data: WORKFLOW_MODELS,
  };
}

/**
 * Conversation memory functions
 */
export function getOrCreateConversation(conversationId?: string): {
  id: string;
  messages: ConversationMessage[];
} {
  if (conversationId && conversationStore.has(conversationId)) {
    const conv = conversationStore.get(conversationId);
    if (conv) {
      return { id: conv.id, messages: [...conv.messages] };
    }
  }

  // Create new conversation
  const id = conversationId || `conv_${ulid()}`;
  const conversation: Conversation = {
    id,
    messages: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  conversationStore.set(id, conversation);
  return { id, messages: [] };
}

export function addMessageToConversation(
  conversationId: string,
  role: "user" | "assistant" | "system",
  content: string,
): void {
  const conversation = conversationStore.get(conversationId);
  if (!conversation) return;

  conversation.messages.push({
    role,
    content,
    timestamp: new Date().toISOString(),
  });

  // Trim to max messages (keep most recent)
  if (conversation.messages.length > MAX_CONVERSATION_MESSAGES) {
    conversation.messages = conversation.messages.slice(
      -MAX_CONVERSATION_MESSAGES,
    );
  }

  conversation.updated_at = new Date().toISOString();
}

export function getConversationContext(
  conversationId: string,
  maxMessages = 10,
): string {
  const conversation = conversationStore.get(conversationId);
  if (!conversation || conversation.messages.length === 0) {
    return "";
  }

  // Get recent messages (excluding system)
  const recentMessages = conversation.messages
    .filter((m) => m.role !== "system")
    .slice(-maxMessages);

  if (recentMessages.length === 0) {
    return "";
  }

  return recentMessages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");
}

/**
 * Rough token estimation (very approximate)
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token on average
  return Math.ceil(text.length / 4);
}

/**
 * Parse JSON body safely
 */
export async function parseJsonBody(
  req: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    if (typeof body === "object" && body !== null) {
      return body as Record<string, unknown>;
    }
  } catch {
    // Invalid JSON
  }
  return null;
}

/**
 * Create SSE response for streaming
 */
export function createStreamResponse(
  generator: AsyncGenerator<ChatCompletionStreamChunk>,
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          const data = JSON.stringify(chunk);
          controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
        }
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
