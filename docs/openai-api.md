# Atlas OpenAI-Compatible API

This document describes the OpenAI-compatible chat completions API that allows you to interact with Atlas workflows through a familiar chat interface.

## Overview

Atlas exposes an OpenAI-compatible API that maps chat completion requests to Atlas workflows. Each chat message creates an Atlas job that runs a workflow (like `scratchpad.v1` or `brainstorm.v1`) and returns the result as a chat response.

## Configuration

The OpenAI-compatible API is available whenever Atlas is running.

```bash
bun run start
```

## Endpoints

### List Models

```bash
GET /v1/models
```

Returns available Atlas "models" that map to workflows:

- `atlas-scratchpad` - Structured synthesis and ideation (scratchpad.v1)
- `atlas-brainstorm` - Idea generation sessions (brainstorm.v1)
- `atlas-code` - Code assistance and generation (code.assist.v1)

**Example:**
```bash
curl http://localhost:3000/v1/models
```

**Response:**
```json
{
  "object": "list",
  "data": [
    {
      "id": "atlas-scratchpad",
      "object": "model",
      "created": 1704067200,
      "owned_by": "atlas"
    },
    {
      "id": "atlas-brainstorm",
      "object": "model",
      "created": 1704067200,
      "owned_by": "atlas"
    },
    {
      "id": "atlas-code",
      "object": "model",
      "created": 1704067200,
      "owned_by": "atlas"
    }
  ]
}
```

### Create Chat Completion

```bash
POST /v1/chat/completions
```

Creates a chat completion by running an Atlas workflow.

**Request Body:**
```json
{
  "model": "atlas-scratchpad",
  "messages": [
    {"role": "user", "content": "What should I focus on this week?"}
  ],
  "temperature": 0.4,
  "max_tokens": 1200,
  "stream": false,
  "conversation_id": "conv_abc123"  // Optional: for multi-turn conversations
}
```

**Parameters:**
- `model` (required): The model ID (`atlas-scratchpad`, `atlas-brainstorm`, `atlas-code`)
- `messages` (required): Array of message objects
- `temperature` (optional): Controls randomness (default: 0.4 for scratchpad)
- `max_tokens` (optional): Maximum tokens in response
- `stream` (optional): Enable streaming response (default: false)
- `conversation_id` (optional): Conversation ID for multi-turn context

**Example:**
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "atlas-scratchpad",
    "messages": [{"role": "user", "content": "What are my recent brainstorms about AI?"}]
  }'
```

**Response:**
```json
{
  "id": "job_abc123",
  "object": "chat.completion",
  "created": 1704067200,
  "model": "atlas-scratchpad",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "## Scratchpad: AI brainstorms\n\nBased on your recent artifacts..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 45,
    "completion_tokens": 892,
    "total_tokens": 937
  }
}
```

### Streaming Response

Enable streaming with `"stream": true`:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "atlas-scratchpad",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

Returns Server-Sent Events (SSE) with chunks:
```
data: {"id":"job_abc123","object":"chat.completion.chunk","created":1704067200,"model":"atlas-scratchpad","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"job_abc123","object":"chat.completion.chunk","created":1704067200,"model":"atlas-scratchpad","choices":[{"index":0,"delta":{"content":"⏳ Processing request...\\n"},"finish_reason":null}]}

data: {"id":"job_abc123","object":"chat.completion.chunk","created":1704067200,"model":"atlas-scratchpad","choices":[{"index":0,"delta":{"content":"Hello! Based on your recent..."},"finish_reason":null}]}

data: [DONE]
```

## Conversational Memory

Atlas supports multi-turn conversations through the `conversation_id` parameter.

**How it works:**
1. First message: Don't include `conversation_id` (or use a new one)
2. Atlas returns a conversation ID in the response headers
3. Subsequent messages: Include the same `conversation_id` to maintain context

**Example:**
```bash
# First message
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "atlas-scratchpad",
    "messages": [{"role": "user", "content": "What are my bookmarks about AI?"}]
  }'

# Response includes conversation_id in headers: X-Conversation-Id: conv_xyz789

# Follow-up message
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "atlas-scratchpad",
    "messages": [{"role": "user", "content": "Can you summarize those?"}],
    "conversation_id": "conv_xyz789"
  }'
```

**Features:**
- Last 20 messages are retained per conversation
- Last 10 messages are included as context for synthesis
- System messages are filtered from context
- Conversation memory is in-memory only (not persisted to database)

## Model Routing

Atlas automatically selects workflows based on model and content:

| Model | Workflow | Use Case |
|-------|----------|----------|
| `atlas-scratchpad` | `scratchpad.v1` | General questions, synthesis, analysis |
| `atlas-brainstorm` | `brainstorm.v1` | Idea generation, creative thinking |
| `atlas-code` | `code.assist.v1` | Code assistance, refactoring, implementation |

**Auto-routing based on content:**
- Messages containing "code", "function", "implement", or "refactor" → code.assist.v1
- Messages containing "brainstorm", "ideas", "generate ideas" → brainstorm.v1
- Everything else → scratchpad.v1

## Response Times

Since Atlas is job-based, response times differ from traditional chat APIs:

| Workflow | Typical Response Time |
|----------|----------------------|
| `scratchpad.v1` | 5-15 seconds |
| `brainstorm.v1` | 5-15 seconds |
| `code.assist.v1` | 10-60 seconds (depends on task complexity) |

**Streaming:** Use `"stream": true` to see progress updates while waiting.

## Error Handling

**400 Bad Request:**
```json
{"error": "model is required"}
{"error": "messages array is required"}
```

**500 Internal Server Error:**
```json
{"error": "Job timed out after 120000ms"}
```

## Using with OpenAI SDK

You can use Atlas with any OpenAI-compatible client:

### JavaScript/TypeScript

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'not-needed',
  baseURL: 'http://localhost:3000/v1',
});

const response = await openai.chat.completions.create({
  model: 'atlas-scratchpad',
  messages: [{ role: 'user', content: 'What should I focus on?' }],
});

console.log(response.choices[0].message.content);
```

### Python

```python
from openai import OpenAI

client = OpenAI(
    api_key="not-needed",
    base_url="http://localhost:3000/v1"
)

response = client.chat.completions.create(
    model="atlas-scratchpad",
    messages=[{"role": "user", "content": "What should I focus on?"}]
)

print(response.choices[0].message.content)
```

## Best Practices

1. **Enable Streaming:** For better UX, use `"stream": true` to show progress
2. **Handle Timeouts:** Set client timeouts to at least 120 seconds
3. **Use Conversation IDs:** For multi-turn interactions, maintain `conversation_id`
4. **Choose the Right Model:** Use `atlas-code` for code tasks, `atlas-brainstorm` for ideation
5. **Monitor Jobs:** Check `/ops` dashboard to see job status and artifacts

## Limitations

- **No Real-time Chat:** Each message creates a job (5-60s response time)
- **No Function Calling:** Tools/tools_calls not supported
- **In-memory Conversations:** Conversation history is lost on restart
- **Single Model Per Request:** Cannot mix models in one conversation
- **Approval Gates:** Some workflows may pause for human approval

## Architecture

The OpenAI adapter works by:

1. Receiving OpenAI-formatted requests
2. Mapping to appropriate Atlas workflow
3. Creating a job in the command queue
4. Polling job status
5. Extracting content from artifacts
6. Returning OpenAI-formatted response

Each chat completion produces:
- A job (visible in `/ops`)
- One or more artifacts (visible in `/artifacts`)
- A conversation entry (if using `conversation_id`)
