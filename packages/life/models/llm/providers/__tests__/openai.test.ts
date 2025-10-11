// openai.test.ts
import { beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

// Mock at module level
vi.mock("openai");

import { OpenAILLM, openAILLMConfig } from "../openai";
import { OpenAI } from "openai";

const MockedOpenAI = vi.mocked(OpenAI);

describe("OpenAILLM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    test("throws error when no API key provided", () => {
      const cfg = openAILLMConfig.schema.parse({
        provider: "openai",
        model: "gpt-4o-mini",
      });
      expect(() => new OpenAILLM(cfg)).toThrow(/OPENAI_API_KEY/);
    });
  });

  describe("generateObject", () => {
    test("returns success with valid JSON response", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ ok: true, n: 1 }) } }],
      });

      MockedOpenAI.mockImplementation(
        () =>
          ({
            chat: {
              completions: {
                create: mockCreate,
              },
            },
          }) as any
      );

      const cfg = openAILLMConfig.schema.parse({
        provider: "openai",
        apiKey: "test-key",
        model: "gpt-4o-mini",
        temperature: 0.1,
      });
      const llm = new OpenAILLM(cfg);
      const schema = z.object({ ok: z.boolean(), n: z.number() });

      const [err, res] = await llm.generateObject({ messages: [], schema });
      expect(err).toBeUndefined();
      expect(res?.success).toBe(true);
      if (res?.success) {
        expect(res.data).toEqual({ ok: true, n: 1 });
      }
    });

    test("returns validation failure for invalid JSON", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{ message: { content: "invalid json" } }],
      });

      MockedOpenAI.mockImplementation(
        () =>
          ({
            chat: {
              completions: {
                create: mockCreate,
              },
            },
          }) as any
      );

      const cfg = openAILLMConfig.schema.parse({
        provider: "openai",
        apiKey: "test-key",
        model: "gpt-4o-mini",
      });
      const llm = new OpenAILLM(cfg);
      const schema = z.object({ ok: z.boolean() });

      const [err, res] = await llm.generateObject({ messages: [], schema });
      expect(res).toBeUndefined();
      expect(err?.code).toBe("Validation");
      expect(err?.message).toMatch(/Failed to parse response as JSON/);
    });

    test("returns validation failure for schema mismatch", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ notOk: "wrong" }) } }],
      });

      MockedOpenAI.mockImplementation(
        () =>
          ({
            chat: {
              completions: {
                create: mockCreate,
              },
            },
          }) as any
      );

      const cfg = openAILLMConfig.schema.parse({
        provider: "openai",
        apiKey: "test-key",
        model: "gpt-4o-mini",
      });
      const llm = new OpenAILLM(cfg);
      const schema = z.object({ ok: z.boolean(), required: z.string() });

      const [err, res] = await llm.generateObject({ messages: [], schema });
      expect(res).toBeUndefined();
      expect(err?.code).toBe("Validation");
      expect(err?.message).toMatch(/Schema validation failed/);
    });

    test("returns failure for missing response content", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{ message: {} }],
      });

      MockedOpenAI.mockImplementation(
        () =>
          ({
            chat: {
              completions: {
                create: mockCreate,
              },
            },
          }) as any
      );

      const cfg = openAILLMConfig.schema.parse({
        provider: "openai",
        apiKey: "test-key",
        model: "gpt-4o-mini",
      });
      const llm = new OpenAILLM(cfg);
      const schema = z.object({ ok: z.boolean() });

      const [err, res] = await llm.generateObject({ messages: [], schema });
      expect(res).toBeUndefined();
      expect(err?.code).toBe("Upstream");
      expect(err?.message).toBe("Invalid response format from OpenAI API");
    });
  });

  describe("generateMessage", () => {
    test("returns success and streams content chunks", async () => {
      const contentChunks = [
        { choices: [{ delta: { content: "Hello" }, finish_reason: null }] },
        { choices: [{ delta: { content: " World" }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: "stop" }] },
      ];

      const mockCreate = vi.fn().mockResolvedValue({
        [Symbol.asyncIterator]() {
          let i = 0;
          return {
            async next() {
              if (i >= contentChunks.length) return { done: true, value: undefined };
              return { done: false, value: contentChunks[i++] };
            },
          };
        },
      });

      MockedOpenAI.mockImplementation(
        () =>
          ({
            chat: {
              completions: {
                create: mockCreate,
              },
            },
          }) as any
      );

      const cfg = openAILLMConfig.schema.parse({
        provider: "openai",
        apiKey: "test-key",
        model: "gpt-4o-mini",
        temperature: 0.1,
      });
      const llm = new OpenAILLM(cfg);

      const [err, job] = await llm.generateMessage({ messages: [], tools: [] });
      expect(err).toBeUndefined();
      expect(job).toBeDefined();

      const chunks: any[] = [];
      for await (const c of job!.getStream()) chunks.push(c);

      expect(chunks).toEqual([
        { type: "content", content: "Hello" },
        { type: "content", content: " World" },
        { type: "end" },
      ]);
    });

    test("handles tool calls in streaming response", async () => {
      const contentChunks = [
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    id: "call1",
                    function: { name: "testTool", arguments: '{"key":"value"}' },
                    type: "function",
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        },
        { choices: [{ delta: {}, finish_reason: "stop" }] },
      ];

      const mockCreate = vi.fn().mockResolvedValue({
        [Symbol.asyncIterator]() {
          let i = 0;
          return {
            async next() {
              if (i >= contentChunks.length) return { done: true, value: undefined };
              return { done: false, value: contentChunks[i++] };
            },
          };
        },
      });

      MockedOpenAI.mockImplementation(
        () =>
          ({
            chat: {
              completions: {
                create: mockCreate,
              },
            },
          }) as any
      );

      const cfg = openAILLMConfig.schema.parse({
        provider: "openai",
        apiKey: "test-key",
        model: "gpt-4o-mini",
        temperature: 0.1,
      });
      const llm = new OpenAILLM(cfg);

      const [err, job] = await llm.generateMessage({ messages: [], tools: [] });
      expect(err).toBeUndefined();
      expect(job).toBeDefined();

      const chunks: any[] = [];
      for await (const c of job!.getStream()) chunks.push(c);

      expect(chunks).toEqual([
        {
          type: "tools",
          tools: [
            {
              id: "call1",
              name: "testTool",
              input: { key: "value" },
            },
          ],
        },
        { type: "end" },
      ]);
    });
  });
});
