/**
 * Tests for the OpenAI-compatible adapter
 */

import { describe, expect, test } from "bun:test";
import {
  type ChatCompletionMessage,
  addMessageToConversation,
  estimateTokens,
  getConversationContext,
  getOrCreateConversation,
} from "../../src/api/openai_adapter";

describe("OpenAI Adapter", () => {
  describe("Conversation Memory", () => {
    test("getOrCreateConversation creates new conversation", () => {
      const conv = getOrCreateConversation();

      expect(conv.id).toBeDefined();
      expect(conv.id).toStartWith("conv_");
      expect(conv.messages).toBeArray();
      expect(conv.messages.length).toBe(0);
    });

    test("getOrCreateConversation retrieves existing conversation", () => {
      // Use unique ID to avoid interference from other tests
      const uniqueId = `conv_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const conv1 = getOrCreateConversation(uniqueId);
      addMessageToConversation(conv1.id, "user", "Hello");

      const conv2 = getOrCreateConversation(uniqueId);

      expect(conv2.id).toBe(conv1.id);
      expect(conv2.messages.length).toBe(1);
      expect(conv2.messages[0].content).toBe("Hello");
    });

    test("addMessageToConversation adds messages", () => {
      const conv = getOrCreateConversation();

      addMessageToConversation(conv.id, "user", "Hello");
      addMessageToConversation(conv.id, "assistant", "Hi there!");

      const retrieved = getOrCreateConversation(conv.id);
      expect(retrieved.messages.length).toBe(2);
      expect(retrieved.messages[0].role).toBe("user");
      expect(retrieved.messages[0].content).toBe("Hello");
      expect(retrieved.messages[1].role).toBe("assistant");
      expect(retrieved.messages[1].content).toBe("Hi there!");
    });

    test("conversation trims to max messages", () => {
      const conv = getOrCreateConversation();

      // Add 25 messages (max is 20)
      for (let i = 0; i < 25; i++) {
        addMessageToConversation(conv.id, "user", `Message ${i}`);
      }

      const retrieved = getOrCreateConversation(conv.id);
      expect(retrieved.messages.length).toBe(20);
      // Should keep the most recent messages
      expect(retrieved.messages[19].content).toBe("Message 24");
    });

    test("getConversationContext returns formatted context", () => {
      const conv = getOrCreateConversation();

      addMessageToConversation(conv.id, "user", "First question");
      addMessageToConversation(conv.id, "assistant", "First answer");
      addMessageToConversation(conv.id, "user", "Second question");
      addMessageToConversation(conv.id, "assistant", "Second answer");

      const context = getConversationContext(conv.id, 2);

      expect(context).toContain("User: Second question");
      expect(context).toContain("Assistant: Second answer");
      expect(context).not.toContain("First"); // Only last 2 messages
    });

    test("getConversationContext filters system messages", () => {
      const conv = getOrCreateConversation();

      addMessageToConversation(conv.id, "system", "System instruction");
      addMessageToConversation(conv.id, "user", "User question");

      const context = getConversationContext(conv.id, 10);

      expect(context).not.toContain("System instruction");
      expect(context).toContain("User: User question");
    });

    test("getConversationContext returns empty for nonexistent conversation", () => {
      const context = getConversationContext("conv_nonexistent", 10);
      expect(context).toBe("");
    });

    test("getConversationContext returns empty for empty conversation", () => {
      const conv = getOrCreateConversation();
      const context = getConversationContext(conv.id, 10);
      expect(context).toBe("");
    });
  });

  describe("Token Estimation", () => {
    test("estimateTokens approximates correctly", () => {
      // Roughly 4 chars per token
      expect(estimateTokens("")).toBe(0);
      expect(estimateTokens("hello")).toBe(2); // ceil(5/4)
      expect(estimateTokens("hello world")).toBe(3); // ceil(11/4)
      expect(estimateTokens("a".repeat(100))).toBe(25); // ceil(100/4)
    });
  });

  describe("Message Types", () => {
    test("ChatCompletionMessage interface accepts valid messages", () => {
      const messages: ChatCompletionMessage[] = [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      expect(messages).toBeArray();
      expect(messages.length).toBe(3);
      expect(messages[0].role).toBe("system");
      expect(messages[1].role).toBe("user");
      expect(messages[2].role).toBe("assistant");
    });
  });
});
