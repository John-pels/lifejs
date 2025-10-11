import { beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { MistralLLM, mistralLLMConfig } from "../mistral";

// Shared mock client instance
let mockClientInstance: any = null;

// Create successful object completion mock
const createSuccessObjectClient = () => ({
  chat: {
    complete: vi.fn().mockResolvedValue({
      choices: [{ 
        message: { content: JSON.stringify({ ok: true, m: 7 }) },
        finish_reason: "stop"
      }],
    }),
  },
});

// Create invalid JSON mock
const createInvalidJsonClient = () => ({
  chat: {
    complete: vi.fn().mockResolvedValue({
      choices: [{ message: { content: "invalid json" } }],
    }),
  },
});

// Create schema mismatch mock
const createSchemaMismatchClient = () => ({
  chat: {
    complete: vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ notOk: "wrong" }) } }],
    }),
  },
});

// Create missing content mock
const createMissingContentClient = () => ({
  chat: {
    complete: vi.fn().mockResolvedValue({
      choices: [{ message: {} }],
    }),
  },
});

// Create streaming message mock
const createStreamingMessageClient = () => {
  return {
    chat: {
      stream: vi.fn(async function* () {
        yield { data: { choices: [{ delta: { content: "Hello" }, finish_reason: null }] } };
        yield { data: { choices: [{ delta: { content: " World" }, finish_reason: null }] } };
        yield { data: { choices: [{ delta: {}, finish_reason: "stop" }] } };
      }),
    },
  };
};

// Create stream error mock
const createStreamErrorClient = () => ({
  chat: {
    stream: vi.fn().mockRejectedValue(new Error("Stream creation failed")),
  },
});

// Create tool calls streaming mock
const createToolCallsClient = () => {
  return {
    chat: {
      stream: vi.fn(async function* () {
        yield {
          data: {
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
        };
        yield { data: { choices: [{ delta: {}, finish_reason: "stop" }] } };
      }),
    },
  };
};

// Mock Mistral SDK at the top level
vi.mock("@mistralai/mistralai", () => ({
  Mistral: vi.fn(function (this: any, config: any) {
    // Copy mockClientInstance to this instance
    Object.assign(this, mockClientInstance);
  }),
}));

describe("MistralLLM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set default successful client
    mockClientInstance = createSuccessObjectClient();
  });

  describe("constructor", () => {
    test("throws error when no API key provided", () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        model: "mistral-small-latest",
      });
      expect(() => new MistralLLM(cfg)).toThrow(/MISTRAL_API_KEY/);
    });
  });

  describe("generateObject", () => {
    test("returns success with valid JSON response", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: "test-key",
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);
      const schema = z.object({ ok: z.boolean(), m: z.number() });

      const [err, res] = await llm.generateObject({ messages: [], schema });
      expect(err).toBeUndefined();
      expect(res?.success).toBe(true);
      if (res?.success) {
        expect(res.data).toEqual({ ok: true, m: 7 });
      }
    });

    test("returns validation failure for invalid JSON", async () => {
      mockClientInstance = createInvalidJsonClient();

      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: "test-key",
        model: "mistral-small-latest",
      });
      const llm = new MistralLLM(cfg);
      const schema = z.object({ ok: z.boolean() });

      const [err, res] = await llm.generateObject({ messages: [], schema });
      expect(res).toBeUndefined();
      expect(err?.code).toBe("Validation");
      expect(err?.message).toMatch(/Failed to parse response as JSON/);
    });

    test("returns validation failure for schema mismatch", async () => {
      mockClientInstance = createSchemaMismatchClient();

      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: "test-key",
        model: "mistral-small-latest",
      });
      const llm = new MistralLLM(cfg);
      const schema = z.object({ ok: z.boolean(), required: z.string() });

      const [err, res] = await llm.generateObject({ messages: [], schema });
      expect(res).toBeUndefined();
      expect(err?.code).toBe("Validation");
      expect(err?.message).toMatch(/Schema validation failed/);
    });

    test("returns failure for missing response content", async () => {
      mockClientInstance = createMissingContentClient();

      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: "test-key",
        model: "mistral-small-latest",
      });
      const llm = new MistralLLM(cfg);
      const schema = z.object({ ok: z.boolean() });

      const [err, res] = await llm.generateObject({ messages: [], schema });
      expect(res).toBeUndefined();
      expect(err?.code).toBe("Upstream");
      expect(err?.message).toBe("Invalid response format from Mistral API");
    });
  });

  describe("generateMessage", () => {
    test("returns success and streams content chunks", async () => {
      mockClientInstance = createStreamingMessageClient();

      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: "test-key",
        model: "mistral-small-latest",
      });
      const llm = new MistralLLM(cfg);

      const [err, job] = await llm.generateMessage({ messages: [], tools: [] });
      expect(err).toBeUndefined();
      expect(job).toBeDefined();

      // Wait for setImmediate callback to run and start stream processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const chunks: any[] = [];
      for await (const c of job!.getStream()) {
        chunks.push(c);
      }

      expect(chunks).toEqual([
        { type: "content", content: "Hello" },
        { type: "content", content: " World" },
        { type: "end" },
      ]);
    });

    test("returns failure when stream creation fails", async () => {
      mockClientInstance = createStreamErrorClient();

      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: "test-key",
        model: "mistral-small-latest",
      });
      const llm = new MistralLLM(cfg);
      const [err, job] = await llm.generateMessage({ messages: [], tools: [] });
      expect(job).toBeUndefined();
      expect(err?.code).toBe("Upstream");
      expect(err?.message).toBe("Failed to create stream");
    });

    test("handles tool calls in streaming response", async () => {
      mockClientInstance = createToolCallsClient();

      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: "test-key",
        model: "mistral-small-latest",
      });
      const llm = new MistralLLM(cfg);

      const [err, job] = await llm.generateMessage({ messages: [], tools: [] });
      expect(err).toBeUndefined();
      expect(job).toBeDefined();

      // Wait for setImmediate callback to run and start stream processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const chunks: any[] = [];
      for await (const c of job!.getStream()) {
        chunks.push(c);
      }

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
