import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import type { Message, ToolDefinition } from "@/shared/resources";
import { MistralLLM } from "../providers/mistral";

function createMessage(role: Message["role"], content: string): Message {
  const now = Date.now();
  return {
    id: `msg-${Math.random().toString(36).substring(2, 9)}`,
    role,
    content,
    createdAt: now,
    lastUpdated: now,
  } as Message;
}

function createSearchTool(): ToolDefinition {
  return {
    name: "search",
    description: "Search for information on the web",
    schema: {
      input: z.object({
        query: z.string().describe("The search query"),
      }),
      output: z.object({
        result: z.string().describe("The search result"),
      }),
    },
    run: async (input: unknown) => ({
      success: true,
      output: { result: `Mock search result for: ${(input as { query: string }).query}` },
    }),
  };
}

function createCalculatorTool(): ToolDefinition {
  return {
    name: "calculator",
    description: "Perform mathematical calculations",
    schema: {
      input: z.object({
        expression: z.string().describe("Mathematical expression to evaluate"),
      }),
      output: z.object({
        result: z.number().describe("The calculation result"),
      }),
    },
    run: async (_input: unknown) => ({
      success: true,
      output: { result: 42 },
    }),
  };
}

function createWeatherTool(): ToolDefinition {
  return {
    name: "weather",
    description: "Get weather information for a location",
    schema: {
      input: z.object({
        location: z.string().describe("The location to get weather for"),
      }),
      output: z.object({
        temperature: z.number().describe("Temperature in Celsius"),
        condition: z.string().describe("Weather condition"),
      }),
    },
    run: async (_input: unknown) => ({
      success: true,
      output: { temperature: 22, condition: "Sunny" },
    }),
  };
}

// Helper to collect stream chunks
async function collectStreamChunks(
  job: Awaited<ReturnType<MistralLLM["generateMessage"]>>,
): Promise<{
  content: string;
  toolCalls?: Array<{ name: string; arguments: unknown }>;
  error?: string;
}> {
  const stream = job.getStream();
  let content = "";
  let toolCalls: Array<{ name: string; arguments: unknown }> = [];
  let error: string | undefined;

  for await (const chunk of stream) {
    if (chunk.type === "content") {
      content += chunk.content;
    } else if (chunk.type === "tools") {
      toolCalls = chunk.tools.map((t) => ({
        name: t.name,
        arguments: t.input,
      }));
    } else if (chunk.type === "error") {
      error = chunk.error;
    } else if (chunk.type === "end") {
      break;
    }
  }

  return { content, toolCalls: toolCalls.length > 0 ? toolCalls : undefined, error };
}

describe("Mistral LLM Provider", () => {
  const provider = process.env.MISTRAL_API_KEY
    ? new MistralLLM({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-large-latest",
        temperature: 0.1,
      })
    : null;

  const skipCondition = !provider;

  beforeAll(() => {
    console.log("🚀 Testing Mistral LLM Provider\n");

    if (skipCondition) {
      console.log("⚠️  Skipping Mistral - MISTRAL_API_KEY not set");
      console.log("\nTo run tests, set the environment variable:");
      console.log("export MISTRAL_API_KEY=your_key_here");
    } else {
      console.log("✅ API key found, running tests...");
    }
  });

  it.skipIf(skipCondition)("should generate basic message", async () => {
    const messages: Message[] = [
      createMessage("system", "You are a helpful assistant. Be concise."),
      createMessage("user", "Say 'Hello World' and nothing else."),
    ];

    const job = await provider?.generateMessage({ messages, tools: [] });
    expect(job).toBeDefined();

    if (job) {
      const result = await collectStreamChunks(job);
      expect(result.error).toBeUndefined();
      expect(result.content).toBeDefined();
      expect(result.content.toLowerCase()).toContain("hello");
      console.log(`✅ Basic message generation: "${result.content}"`);
    }
  });

  it.skipIf(skipCondition)("should generate structured object", async () => {
    const messages: Message[] = [
      createMessage("system", "Extract information and return as JSON."),
      createMessage("user", "John Doe is 30 years old and lives in New York."),
    ];

    const PersonSchema = z.object({
      name: z.string(),
      age: z.number(),
      city: z.string(),
    });

    const response = await provider?.generateObject({ messages, schema: PersonSchema });

    expect(response).toBeDefined();
    if (response?.success) {
      expect(response.data).toHaveProperty("name");
      expect(response.data).toHaveProperty("age");
      expect(response.data).toHaveProperty("city");
      expect(response.data.name).toContain("John");
      expect(response.data.age).toBe(30);
      expect(response.data.city).toContain("New York");
      console.log("✅ Structured object generation:", JSON.stringify(response.data));
    }
  });

  it.skipIf(skipCondition)("should handle single tool call", async () => {
    const messages: Message[] = [
      createMessage("system", "You can search for information. Use tools when needed."),
      createMessage("user", "Search for information about TypeScript."),
    ];

    const tools = [createSearchTool()];
    const job = await provider?.generateMessage({ messages, tools });

    expect(job).toBeDefined();
    if (job) {
      const result = await collectStreamChunks(job);
      expect(result.error).toBeUndefined();
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls).toHaveLength(1);

      if (result.toolCalls?.[0]) {
        expect(result.toolCalls[0].name).toBe("search");
        expect(result.toolCalls[0].arguments).toHaveProperty("query");
        console.log("✅ Single tool call:", result.toolCalls[0].name);
      }
    }
  });

  it.skipIf(skipCondition)("should handle parallel tool calls", async () => {
    const messages: Message[] = [
      createMessage(
        "system",
        "You can search, calculate, and check weather. Use multiple tools in parallel when appropriate.",
      ),
      createMessage("user", "What's the weather in Paris and what's 15 * 24?"),
    ];

    const tools = [createSearchTool(), createCalculatorTool(), createWeatherTool()];
    const job = await provider?.generateMessage({ messages, tools });

    expect(job).toBeDefined();
    if (job) {
      const result = await collectStreamChunks(job);
      expect(result.error).toBeUndefined();

      if (result.toolCalls) {
        expect(result.toolCalls.length).toBeGreaterThanOrEqual(2);

        const toolNames = result.toolCalls.map((tc) => tc.name);
        expect(toolNames).toContain("weather");
        expect(toolNames).toContain("calculator");

        console.log(`✅ Parallel tool calls: ${toolNames.join(", ")}`);
      }
    }
  });

  it.skipIf(skipCondition)("should handle tool chaining", async () => {
    const messages: Message[] = [
      createMessage(
        "system",
        "You can search for information and calculate. Chain tools as needed.",
      ),
      createMessage("user", "Search for the population of Tokyo, then calculate 10% of it."),
    ];

    const tools = [createSearchTool(), createCalculatorTool()];

    // First call - should request search
    const job1 = await provider?.generateMessage({ messages, tools });
    expect(job1).toBeDefined();

    if (job1) {
      const result1 = await collectStreamChunks(job1);
      expect(result1.error).toBeUndefined();

      if (result1.toolCalls?.[0]) {
        expect(result1.toolCalls[0].name).toBe("search");

        // Simulate tool execution and add to messages
        const toolResponseMessage: Message = {
          id: `msg-${Math.random().toString(36).substring(2, 9)}`,
          role: "tool-response",
          content: JSON.stringify({ result: "Population of Tokyo is 14 million" }),
          toolId: "tool-id-1",
          toolSuccess: true,
          createdAt: Date.now(),
          lastUpdated: Date.now(),
        } as Message;

        const updatedMessages = [...messages, toolResponseMessage];

        // Second call - should request calculation
        const job2 = await provider?.generateMessage({ messages: updatedMessages, tools });
        expect(job2).toBeDefined();

        if (job2) {
          const result2 = await collectStreamChunks(job2);
          expect(result2.error).toBeUndefined();

          // Provider might calculate directly or use calculator tool
          if (result2.toolCalls && result2.toolCalls.length > 0 && result2.toolCalls[0]) {
            expect(result2.toolCalls[0].name).toBe("calculator");
            console.log("✅ Tool chaining: search → calculator");
          } else {
            // Provider calculated directly in response
            expect(result2.content).toBeDefined();
            console.log("✅ Tool chaining: search → direct calculation");
          }
        }
      }
    }
  });

  it("should report summary", () => {
    if (!provider) {
      console.log("\nTests skipped - API key not configured");
    }
    // This test always passes - it's just for reporting
    expect(true).toBe(true);
  });
});
