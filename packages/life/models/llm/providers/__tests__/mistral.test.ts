import { describe, expect, test } from "vitest";
import { z } from "zod";
import { MistralLLM, mistralLLMConfig } from "../mistral";

const API_KEY_REGEX = /MISTRAL_API_KEY/;
const VALIDATION_FAILED_REGEX = /Schema validation failed/;
const TIMEOUT = 30_000;

describe("MistralLLM", () => {
  describe("constructor", () => {
    test("throws error when no API key provided", () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        model: "mistral-small-latest",
      });
      expect(() => new MistralLLM(cfg)).toThrow(API_KEY_REGEX);
    });

    test("successfully creates instance with API key", () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
      });
      expect(() => new MistralLLM(cfg)).not.toThrow();
    });

    test("applies default values from config schema", () => {
      const llm = new MistralLLM({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY || "test-key",
      });
      expect(llm.config.model).toBe("mistral-small-latest");
      expect(llm.config.temperature).toBe(0.5);
    });

    test("respects custom temperature and model values", () => {
      const llm = new MistralLLM({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY || "test-key",
        model: "mistral-large-latest",
        temperature: 0.8,
      });
      expect(llm.config.model).toBe("mistral-large-latest");
      expect(llm.config.temperature).toBe(0.8);
    });
  });

  describe("generateObject", () => {
    test("returns success with valid JSON response", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);
      const schema = z.object({ answer: z.number() });

      const [err, res] = await llm.generateObject({
        messages: [
          {
            role: "user",
            content: "What is 2 + 2? Respond with a JSON object containing an 'answer' field with the number.",
            id: "test-msg-1",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        schema,
      });

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      if (res) {
        expect(res.answer).toBe(4);
      }
    }, TIMEOUT);

    test("returns validation failure for schema mismatch", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);
      // Request a boolean but expect a string, which should cause validation failure
      const schema = z.object({ answer: z.string(), extra: z.number() });

      const [err, res] = await llm.generateObject({
        messages: [
          {
            role: "user",
            content: "What is 2 + 2? Respond with a JSON object containing only an 'answer' field with the boolean true.",
            id: "test-msg-2",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        schema,
      });

      expect(res).toBeUndefined();
      expect(err?.code).toBe("Validation");
      expect(err?.message).toMatch(VALIDATION_FAILED_REGEX);
    }, TIMEOUT);

    test("handles complex nested schemas", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);
      const schema = z.object({
        user: z.object({
          name: z.string(),
          age: z.number(),
        }),
        tags: z.array(z.string()),
      });

      const [err, res] = await llm.generateObject({
        messages: [
          {
            role: "user",
            content:
              'Create a user profile for John who is 30 years old with tags "developer" and "engineer". Return as JSON with structure: {user: {name, age}, tags: []}',
            id: "test-msg-3",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        schema,
      });

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      if (res) {
        expect(res.user.name).toBe("John");
        expect(res.user.age).toBe(30);
        expect(res.tags).toContain("developer");
        expect(res.tags).toContain("engineer");
      }
    }, TIMEOUT);

    test("handles conversation with system and user messages", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);
      const schema = z.object({ result: z.number() });

      const [err, res] = await llm.generateObject({
        messages: [
          {
            role: "system",
            content: "You are a calculator. Always respond with JSON containing a 'result' field.",
            id: "test-msg-sys",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
          {
            role: "user",
            content: "What is 5 * 6?",
            id: "test-msg-4",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        schema,
      });

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      if (res) {
        expect(res.result).toBe(30);
      }
    }, TIMEOUT);

    test("handles multi-turn conversation with agent messages", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);
      const schema = z.object({ answer: z.number() });

      const [err, res] = await llm.generateObject({
        messages: [
          {
            role: "user",
            content: "What is 10 + 5?",
            id: "test-msg-5",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
          {
            role: "agent",
            content: "15",
            id: "test-msg-6",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
          {
            role: "user",
            content: "Now multiply that by 2. Return JSON with an 'answer' field.",
            id: "test-msg-7",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        schema,
      });

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      if (res) {
        expect(res.answer).toBe(30);
      }
    }, TIMEOUT);
  });

  describe("generateMessage", () => {
    test("returns success and streams content chunks", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);

      const [err, job] = await llm.generateMessage({
        messages: [
          {
            role: "user",
            content: "Say hello in exactly 2 words.",
            id: "test-msg-8",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        tools: [],
      });

      expect(err).toBeUndefined();
      expect(job).toBeDefined();

      if (!job) return;

      const chunks: any[] = [];
      for await (const chunk of job.getStream()) {
        chunks.push(chunk);
      }

      // Verify we got some content tokens
      const contentChunks = chunks.filter((c) => c.type === "content");
      expect(contentChunks.length).toBeGreaterThan(0);

      // Verify we got an end token
      const endChunk = chunks.find((c) => c.type === "end");
      expect(endChunk).toBeDefined();

      // Verify content is non-empty
      const fullContent = contentChunks.map((c) => c.content).join("");
      expect(fullContent.length).toBeGreaterThan(0);
    }, TIMEOUT);

    test("generates unique job IDs for each request", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
      });
      const llm = new MistralLLM(cfg);

      const [, job1] = await llm.generateMessage({
        messages: [
          {
            role: "user",
            content: "Say hi.",
            id: "test-msg-9",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        tools: [],
      });

      const [, job2] = await llm.generateMessage({
        messages: [
          {
            role: "user",
            content: "Say hello.",
            id: "test-msg-10",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        tools: [],
      });

      expect(job1?.id).toBeDefined();
      expect(job2?.id).toBeDefined();
      expect(job1?.id).not.toBe(job2?.id);

      if (job1) job1.cancel();
      if (job2) job2.cancel();
    }, TIMEOUT);

    test("handles system messages in streaming context", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);

      const [err, job] = await llm.generateMessage({
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant. Be concise.",
            id: "test-msg-sys-2",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
          {
            role: "user",
            content: "What is the capital of France?",
            id: "test-msg-11",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        tools: [],
      });

      expect(err).toBeUndefined();
      expect(job).toBeDefined();

      if (!job) return;

      const chunks: any[] = [];
      for await (const chunk of job.getStream()) {
        chunks.push(chunk);
      }

      const contentChunks = chunks.filter((c) => c.type === "content");
      const fullContent = contentChunks.map((c) => c.content).join("").toLowerCase();

      // Should mention Paris
      expect(fullContent).toContain("paris");
    }, TIMEOUT);

    test("handles tool calls in streaming response", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);

      const [err, job] = await llm.generateMessage({
        messages: [
          {
            role: "user",
            content: "What is the weather in San Francisco? Use the getWeather tool.",
            id: "test-msg-12",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        tools: [
          {
            name: "getWeather",
            description: "Get the current weather for a location",
            schema: {
              input: z.object({
                location: z.string().describe("The city and state, e.g. San Francisco, CA"),
              }),
              output: z.object({
                temperature: z.number(),
                conditions: z.string(),
              }),
            },
            run: () => ({ success: true, output: { temperature: 72, conditions: "sunny" } }),
          },
        ],
      });

      expect(err).toBeUndefined();
      expect(job).toBeDefined();

      if (!job) return;

      const chunks: any[] = [];
      for await (const chunk of job.getStream()) {
        chunks.push(chunk);
      }

      // Verify we got a tools chunk
      const toolChunks = chunks.filter((c) => c.type === "tools");
      expect(toolChunks.length).toBeGreaterThan(0);

      // Verify the tool call structure
      const toolChunk = toolChunks[0];
      expect(toolChunk.tools).toBeDefined();
      expect(toolChunk.tools.length).toBeGreaterThan(0);
      expect(toolChunk.tools[0].name).toBe("getWeather");
      expect(toolChunk.tools[0].input).toBeDefined();
      expect(toolChunk.tools[0].input.location).toBeDefined();

      // Verify we got an end token
      const endChunk = chunks.find((c) => c.type === "end");
      expect(endChunk).toBeDefined();
    }, TIMEOUT);

    test("handles multiple tools being available", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);

      const [err, job] = await llm.generateMessage({
        messages: [
          {
            role: "user",
            content: "Get the weather in Boston using the appropriate tool.",
            id: "test-msg-13",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        tools: [
          {
            name: "getWeather",
            description: "Get the current weather for a location",
            schema: {
              input: z.object({
                location: z.string(),
              }),
              output: z.object({
                temperature: z.number(),
              }),
            },
            run: () => ({ success: true, output: { temperature: 65 } }),
          },
          {
            name: "getTime",
            description: "Get the current time for a location",
            schema: {
              input: z.object({
                timezone: z.string(),
              }),
              output: z.object({
                time: z.string(),
              }),
            },
            run: () => ({ success: true, output: { time: "12:00" } }),
          },
        ],
      });

      expect(err).toBeUndefined();
      expect(job).toBeDefined();

      if (!job) return;

      const chunks: any[] = [];
      for await (const chunk of job.getStream()) {
        chunks.push(chunk);
      }

      const toolChunks = chunks.filter((c) => c.type === "tools");
      if (toolChunks.length > 0) {
        // Should call getWeather, not getTime
        expect(toolChunks[0].tools[0].name).toBe("getWeather");
      }
    }, TIMEOUT);

    test("handles conversation with tool response messages", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);

      const [err, job] = await llm.generateMessage({
        messages: [
          {
            role: "user",
            content: "What is the weather?",
            id: "test-msg-14",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
          {
            role: "agent",
            content: "",
            id: "test-msg-15",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
            toolsRequests: [
              {
                id: "call-1",
                name: "getWeather",
                input: { location: "Boston" },
              },
            ],
          },
          {
            role: "tool-response",
            id: "test-msg-16",
            toolId: "call-1",
            toolSuccess: true,
            toolOutput: { temperature: 72, conditions: "sunny" },
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
          {
            role: "user",
            content: "Is that warm or cold?",
            id: "test-msg-17",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        tools: [],
      });

      expect(err).toBeUndefined();
      expect(job).toBeDefined();

      if (!job) return;

      const chunks: any[] = [];
      for await (const chunk of job.getStream()) {
        chunks.push(chunk);
      }

      const contentChunks = chunks.filter((c) => c.type === "content");
      expect(contentChunks.length).toBeGreaterThan(0);
    }, TIMEOUT);

    test("handles cancellation of streaming response", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);

      const [err, job] = await llm.generateMessage({
        messages: [
          {
            role: "user",
            content: "Write a very long story about a cat. Make it at least 500 words.",
            id: "test-msg-18",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        tools: [],
      });

      expect(err).toBeUndefined();
      expect(job).toBeDefined();

      if (!job) return;

      const chunks: any[] = [];
      let count = 0;

      // Cancel after receiving a few chunks
      for await (const chunk of job.getStream()) {
        chunks.push(chunk);
        count++;
        if (count === 3) {
          job.cancel();
          break;
        }
      }

      // Verify we got some content before cancellation
      const contentChunks = chunks.filter((c) => c.type === "content");
      expect(contentChunks.length).toBeGreaterThan(0);

      // Verify we did not receive an end token (since we cancelled)
      const endChunk = chunks.find((c) => c.type === "end");
      expect(endChunk).toBeUndefined();
    }, TIMEOUT);

    test("handles empty tools array", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);

      const [err, job] = await llm.generateMessage({
        messages: [
          {
            role: "user",
            content: "Say hello.",
            id: "test-msg-19",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        tools: [],
      });

      expect(err).toBeUndefined();
      expect(job).toBeDefined();

      if (!job) return;

      const chunks: any[] = [];
      for await (const chunk of job.getStream()) {
        chunks.push(chunk);
      }

      // Should still work fine without tools
      const contentChunks = chunks.filter((c) => c.type === "content");
      expect(contentChunks.length).toBeGreaterThan(0);
    }, TIMEOUT);

    test("handles different temperature settings", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.1, // Very low temperature for deterministic output
      });
      const llm = new MistralLLM(cfg);

      const [err, job] = await llm.generateMessage({
        messages: [
          {
            role: "user",
            content: "Say exactly: Hello World",
            id: "test-msg-20",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        tools: [],
      });

      expect(err).toBeUndefined();
      expect(job).toBeDefined();

      if (!job) return;

      const chunks: any[] = [];
      for await (const chunk of job.getStream()) {
        chunks.push(chunk);
      }

      const contentChunks = chunks.filter((c) => c.type === "content");
      expect(contentChunks.length).toBeGreaterThan(0);
    }, TIMEOUT);
  });

  describe("edge cases", () => {
    test("handles very long messages", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);

      const longMessage = "word ".repeat(500); // ~2500 characters

      const [err, job] = await llm.generateMessage({
        messages: [
          {
            role: "user",
            content: `${longMessage}. Summarize this in one word.`,
            id: "test-msg-21",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        tools: [],
      });

      expect(err).toBeUndefined();
      expect(job).toBeDefined();

      if (!job) return;

      const chunks: any[] = [];
      for await (const chunk of job.getStream()) {
        chunks.push(chunk);
      }

      const contentChunks = chunks.filter((c) => c.type === "content");
      expect(contentChunks.length).toBeGreaterThan(0);
    }, TIMEOUT);

    test("handles special characters in messages", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);

      const [err, job] = await llm.generateMessage({
        messages: [
          {
            role: "user",
            content: 'Echo this: {"key": "value", "special": "chars!@#$%"}',
            id: "test-msg-22",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        tools: [],
      });

      expect(err).toBeUndefined();
      expect(job).toBeDefined();

      if (!job) return;

      const chunks: any[] = [];
      for await (const chunk of job.getStream()) {
        chunks.push(chunk);
      }

      const contentChunks = chunks.filter((c) => c.type === "content");
      expect(contentChunks.length).toBeGreaterThan(0);
    }, TIMEOUT);

    test("handles unicode and emoji in messages", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);

      const [err, job] = await llm.generateMessage({
        messages: [
          {
            role: "user",
            content: "Respond with a single emoji: 🌟",
            id: "test-msg-23",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        tools: [],
      });

      expect(err).toBeUndefined();
      expect(job).toBeDefined();

      if (!job) return;

      const chunks: any[] = [];
      for await (const chunk of job.getStream()) {
        chunks.push(chunk);
      }

      const contentChunks = chunks.filter((c) => c.type === "content");
      expect(contentChunks.length).toBeGreaterThan(0);
    }, TIMEOUT);

    test("handles schema with optional fields", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);
      const schema = z.object({
        required: z.string(),
        optional: z.string().optional(),
      });

      const [err, res] = await llm.generateObject({
        messages: [
          {
            role: "user",
            content: 'Return JSON with only required field: {"required": "test"}',
            id: "test-msg-24",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        schema,
      });

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      if (res) {
        expect(res.required).toBe("test");
      }
    }, TIMEOUT);

    test("handles concurrent requests", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);

      // Start two requests concurrently
      const promise1 = llm.generateMessage({
        messages: [
          {
            role: "user",
            content: "Say hello.",
            id: "test-msg-25",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        tools: [],
      });

      const promise2 = llm.generateMessage({
        messages: [
          {
            role: "user",
            content: "Say goodbye.",
            id: "test-msg-26",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        tools: [],
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1[0]).toBeUndefined();
      expect(result1[1]).toBeDefined();
      expect(result2[0]).toBeUndefined();
      expect(result2[1]).toBeDefined();

      // Verify they have different job IDs
      expect(result1[1]?.id).not.toBe(result2[1]?.id);

      // Consume streams to prevent hanging
      if (result1[1]) {
        for await (const _ of result1[1].getStream()) {
          // consume stream
        }
      }
      if (result2[1]) {
        for await (const _ of result2[1].getStream()) {
          // consume stream
        }
      }
    }, TIMEOUT);
  });
});
