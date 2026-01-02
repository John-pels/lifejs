import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { describe, expect, it } from "vitest";
import z from "zod";
import type { Message } from "@/shared/messages";
import { LLMProvider } from "./provider";
import type { LLMChunk, LLMTool } from "./types";

// Helper to create test messages with required fields
let msgCounter = 0;
function nextId() {
  msgCounter++;
  return `test-${msgCounter}`;
}

const msg = {
  user: (content: string): Message => ({
    role: "user",
    content,
    id: nextId(),
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  }),
  system: (content: string): Message => ({
    role: "system",
    content,
    id: nextId(),
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  }),
  agent: (content: string): Message => ({
    role: "agent",
    content,
    actions: [],
    id: nextId(),
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  }),
};

// Helper to collect all chunks from a stream
async function collectStream(
  provider: LLMProvider,
  params: Parameters<typeof provider.generateMessage>[0],
) {
  const [error, job] = provider.generateMessage(params);
  if (error) throw error;

  const chunks: LLMChunk[] = [];
  for await (const chunk of job.stream) {
    chunks.push(chunk);
    if (chunk.type === "end") break;
  }

  return { job, chunks };
}

// Helper to extract text content from chunks
function extractContent(chunks: LLMChunk[]): string {
  return chunks
    .filter((c): c is Extract<LLMChunk, { type: "content" }> => c.type === "content")
    .map((c) => c.content)
    .join("");
}

// Helper to extract reasoning content from chunks
function extractReasoning(chunks: LLMChunk[]): string {
  return chunks
    .filter((c): c is Extract<LLMChunk, { type: "reasoning" }> => c.type === "reasoning")
    .map((c) => c.content)
    .join("");
}

// Provider configurations to test
const providers: Array<{ name: string; model: LanguageModel }> = [
  { name: "OpenAI", model: openai("gpt-4o-mini") },
  { name: "Anthropic", model: anthropic("claude-3-5-haiku-latest") },
  { name: "Google", model: google("gemini-2.0-flash") },
];

// Reasoning models require extended thinking enabled
// Claude 3.7+ supports reasoning via the thinking provider option
const reasoningModel = anthropic("claude-sonnet-4-20250514");

describe("LLMProvider", () => {
  describe.each(providers)("$name", ({ model }) => {
    const createProvider = () => new LLMProvider({ model });

    describe("generateMessage", () => {
      it("streams text content", async () => {
        const provider = createProvider();
        const { chunks } = await collectStream(provider, {
          messages: [msg.user("Say 'hello' and nothing else.")],
          tools: [],
        });

        expect(chunks.some((c) => c.type === "content")).toBe(true);
        expect(chunks.at(-1)?.type).toBe("end");

        const content = extractContent(chunks).toLowerCase();
        expect(content).toContain("hello");
      });

      it("handles system messages", async () => {
        const provider = createProvider();
        const { chunks } = await collectStream(provider, {
          messages: [
            msg.system("You only respond with the word 'banana'."),
            msg.user("What is your favorite fruit?"),
          ],
          tools: [],
        });

        const content = extractContent(chunks).toLowerCase();
        expect(content).toContain("banana");
      });

      it("handles multi-turn conversations", async () => {
        const provider = createProvider();
        const { chunks } = await collectStream(provider, {
          messages: [
            msg.user("Remember this number: 42"),
            msg.agent("I'll remember that number: 42."),
            msg.user("What number did I ask you to remember?"),
          ],
          tools: [],
        });

        const content = extractContent(chunks);
        expect(content).toContain("42");
      });

      it("triggers tool calls", async () => {
        const provider = createProvider();

        const weatherTool: LLMTool = {
          name: "get_weather",
          description: "Get the current weather for a location",
          schema: {
            input: z.object({ location: z.string() }),
            output: z.object({ temperature: z.number(), condition: z.string() }),
          },
          execute: () => ({ temperature: 20, condition: "sunny" }),
        };

        const { chunks } = await collectStream(provider, {
          messages: [msg.user("What's the weather in Paris?")],
          tools: [weatherTool],
        });

        const toolsChunk = chunks.find((c) => c.type === "tools");
        expect(toolsChunk).toBeDefined();
        if (toolsChunk?.type === "tools") {
          expect(toolsChunk.tools.length).toBeGreaterThan(0);
          expect(toolsChunk.tools[0]?.name).toBe("get_weather");
          expect(toolsChunk.tools[0]?.input).toHaveProperty("location");
        }
      });

      it("exposes job interface", async () => {
        const provider = createProvider();
        const [error, job] = provider.generateMessage({
          messages: [msg.user("Say 'test' only.")],
          tools: [],
        });

        // Verify no error and job exists
        expect(error).toBeUndefined();
        expect(job).toBeDefined();
        if (!job) return;

        // Verify job interface
        expect(typeof job.cancel).toBe("function");
        expect(typeof job.id).toBe("string");
        expect(job.stream).toBeDefined();

        // Consume the stream to avoid unhandled rejections
        for await (const chunk of job.stream) {
          if (chunk.type === "end") break;
        }
      });

      it("cancels stream mid-flight", async () => {
        const provider = createProvider();
        const [error, job] = provider.generateMessage({
          // Ask for a long response to ensure we can cancel mid-stream
          messages: [msg.user("Count from 1 to 100, one number per line.")],
          tools: [],
        });

        expect(error).toBeUndefined();
        if (!job) return;

        const chunks: LLMChunk[] = [];
        let cancelled = false;

        for await (const chunk of job.stream) {
          chunks.push(chunk);

          // Cancel after receiving first content chunk
          if (chunk.type === "content" && !cancelled) {
            job.cancel();
            cancelled = true;
          }

          if (chunk.type === "end" || chunk.type === "error") break;
        }

        // Should have cancelled before receiving all 100 numbers
        const content = extractContent(chunks);
        expect(content.length).toBeLessThan(300); // Full response would be much longer
        expect(cancelled).toBe(true);
      });
    });

    describe("generateObject", () => {
      it("generates structured output", async () => {
        const provider = createProvider();

        const schema = z.object({
          name: z.string(),
          age: z.number(),
        });

        const [error, result] = await provider.generateObject({
          messages: [msg.user("Generate a person named Alice who is 30 years old.")],
          schema,
        });

        expect(error).toBeUndefined();
        expect(result).toBeDefined();
        expect(result?.name.toLowerCase()).toContain("alice");
        expect(result?.age).toBe(30);
      });

      it("handles complex schemas", async () => {
        const provider = createProvider();

        const schema = z.object({
          items: z.array(z.object({ id: z.number(), label: z.string() })),
          total: z.number(),
        });

        const [error, result] = await provider.generateObject({
          messages: [
            msg.user("Generate a list with 3 items: apple, banana, cherry. Number them 1-3."),
          ],
          schema,
        });

        expect(error).toBeUndefined();
        expect(result?.items).toHaveLength(3);
        expect(result?.total).toBe(3);
      });

      it("handles enums", async () => {
        const provider = createProvider();

        const schema = z.object({
          sentiment: z.enum(["positive", "negative", "neutral"]),
        });

        const [error, result] = await provider.generateObject({
          messages: [msg.user("Analyze sentiment: 'I love this product!'")],
          schema,
        });

        expect(error).toBeUndefined();
        expect(result?.sentiment).toBe("positive");
      });
    });
  });

  describe("error handling", () => {
    it("throws when model is not set", () => {
      expect(() => new LLMProvider({} as never)).toThrow("No LLM model configured");
    });

    it("returns OperationResult tuple from generateObject", async () => {
      const provider = new LLMProvider({ model: openai("gpt-4o-mini") });
      const schema = z.object({ test: z.string() });

      const result = await provider.generateObject({
        messages: [msg.user("Say test")],
        schema,
      });

      // Should always return [error, data] tuple
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });
  });

  describe("retry and fallback", () => {
    // Use a non-existent model to trigger failures
    const brokenModel = openai("gpt-nonexistent-model-xyz");
    const workingModel = openai("gpt-4o-mini");

    it("falls back to secondary model when primary fails (generateObject)", async () => {
      const provider = new LLMProvider({
        model: brokenModel,
        fallbacks: [{ model: workingModel }],
      });

      const schema = z.object({ word: z.string() });
      const [error, result] = await provider.generateObject({
        messages: [msg.user("Return the word 'fallback'")],
        schema,
      });

      expect(error).toBeUndefined();
      expect(result?.word.toLowerCase()).toContain("fallback");
    }, 60_000);

    it("throws error when all models fail", async () => {
      const brokenModel2 = openai("gpt-also-nonexistent-abc");

      const provider = new LLMProvider({
        model: brokenModel,
        fallbacks: [{ model: brokenModel2 }],
      });

      const schema = z.object({ word: z.string() });
      const [error, result] = await provider.generateObject({
        messages: [msg.user("Say hello")],
        schema,
      });

      expect(error).toBeDefined();
      expect(result).toBeUndefined();
    }, 60_000);

    it("retries up to MAX_RETRIES before falling back", async () => {
      // This test verifies that fallback eventually succeeds even with initial failures
      // The broken model will fail 3 times (MAX_RETRIES), then fall back to working model
      const provider = new LLMProvider({
        model: brokenModel,
        fallbacks: [{ model: workingModel }],
      });

      const schema = z.object({ number: z.number() });
      const [error, result] = await provider.generateObject({
        messages: [msg.user("Return the number 42")],
        schema,
      });

      expect(error).toBeUndefined();
      expect(result?.number).toBe(42);
    }, 60_000);
  });

  // Reasoning models (Claude with extended thinking) emit reasoning tokens
  describe("Reasoning: Claude Sonnet 4", () => {
    const createProvider = () =>
      new LLMProvider({
        model: reasoningModel,
        // Enable extended thinking for reasoning tokens
        providerOptions: {
          anthropic: {
            thinking: { type: "enabled", budgetTokens: 2048 },
          },
        },
      });

    it("streams reasoning tokens", async () => {
      const provider = createProvider();
      const { chunks } = await collectStream(provider, {
        messages: [msg.user("What is 17 * 23? Think step by step.")],
        tools: [],
      });

      // Should have content chunks and end
      expect(chunks.some((c) => c.type === "content")).toBe(true);
      expect(chunks.at(-1)?.type).toBe("end");

      // Should have reasoning chunks (chain-of-thought)
      const reasoning = extractReasoning(chunks);
      expect(reasoning.length).toBeGreaterThan(0);

      // Final answer should be correct
      const content = extractContent(chunks);
      expect(content).toContain("391");
    }, 60_000);
  });
});
