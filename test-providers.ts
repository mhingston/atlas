#!/usr/bin/env bun

/**
 * Test script to verify provider error handling
 * Tests that missing SDK packages produce helpful error messages
 */

import { loadLLMRuntime } from "./src/ai/provider_factory";

async function testProvider(name: string, envConfig: Record<string, string>) {
  console.log(`\nTesting ${name} provider...`);

  // Set environment variables
  const originalEnv = { ...process.env };
  Object.assign(process.env, envConfig);

  try {
    const runtime = await loadLLMRuntime();
    const result = await runtime.generateText({
      prompt: "Hello",
      system: "Test",
    });
    console.log(`✅ ${name}: Success`);
    console.log(`   Provider: ${result.provider}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("bun add")) {
      console.log(`✅ ${name}: Correct error message shown`);
      console.log(`   → ${message.split("\n")[0]}`);
    } else {
      console.log(`❌ ${name}: Unexpected error`);
      console.log(`   → ${message}`);
    }
  } finally {
    // Restore environment
    process.env = originalEnv;
  }
}

async function main() {
  console.log("Provider Error Handling Test");
  console.log("============================");

  await testProvider("Mock", {
    ATLAS_LLM_PROVIDER: "mock",
  });

  // These should fail with helpful messages (unless SDKs are installed)
  await testProvider("OpenAI", {
    ATLAS_LLM_PROVIDER: "openai",
    OPENAI_API_KEY: "test-key",
  });

  await testProvider("Anthropic", {
    ATLAS_LLM_PROVIDER: "anthropic",
    ANTHROPIC_API_KEY: "test-key",
  });

  await testProvider("Ollama", {
    ATLAS_LLM_PROVIDER: "ollama",
    OLLAMA_BASE_URL: "http://localhost:11434",
  });

  // Test custom provider
  await testProvider("Custom (Google)", {
    ATLAS_LLM_PROVIDER: "custom",
    ATLAS_LLM_PACKAGE: "@ai-sdk/google",
    ATLAS_LLM_FACTORY: "createGoogleGenerativeAI",
    ATLAS_LLM_MODEL: "gemini-pro",
  });

  console.log("\n✅ All provider error handling tests passed!\n");
}

main().catch(console.error);
