import { z } from "zod";
import type { Message, ToolDefinition } from "@/shared/resources";
import { MistralLLM } from "../providers/mistral";

function createMessage(role: Message["role"], content: string): Message {
  const now = Date.now();
  return {
    id: `msg-${Math.random().toString(36).substr(2, 9)}`,
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
    run: async (input: object) => ({
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
    run: async () => ({
      success: true,
      output: { result: Math.random() * 100 },
    }),
  };
}

// Simple helper to consume a stream with timeout
function consumeStream(
  job: {
    getStream: () => AsyncIterable<{ type: string; [key: string]: unknown }>;
    cancel: () => void;
  },
  timeoutMs = 10_000,
) {
  const results = {
    content: "",
    tools: [] as Array<{ id: string; input: unknown }>,
    hasContent: false,
    toolsCalled: 0,
    error: null as string | null,
  };

  return new Promise<typeof results>((resolve) => {
    const timeout = setTimeout(() => {
      job.cancel();
      resolve(results);
    }, timeoutMs);

    let inactivityTimeout: NodeJS.Timeout | undefined;

    const checkInactivity = () => {
      if (inactivityTimeout) clearTimeout(inactivityTimeout);
      inactivityTimeout = setTimeout(() => {
        if (results.toolsCalled > 0 || results.hasContent) {
          clearTimeout(timeout);
          resolve(results);
        }
      }, 1000);
    };

    (async () => {
      try {
        for await (const chunk of job.getStream()) {
          if (inactivityTimeout) clearTimeout(inactivityTimeout);

          if (chunk.type === "content") {
            results.content += String(chunk.content);
            results.hasContent = true;
            checkInactivity();
          } else if (chunk.type === "tool") {
            results.tools.push({ id: String(chunk.toolId), input: chunk.toolInput });
            results.toolsCalled++;
            checkInactivity();
          } else if (chunk.type === "tools") {
            const tools = chunk.tools as Array<{ id: string; name: string; input: unknown }>;
            results.tools.push(...tools.map((tool) => ({ id: tool.name, input: tool.input })));
            results.toolsCalled += tools.length;
            checkInactivity();
          } else if (chunk.type === "end") {
            break;
          } else if (chunk.type === "error") {
            results.error = String(chunk.error);
            break;
          }
        }
      } catch (error) {
        results.error = String(error);
      } finally {
        clearTimeout(timeout);
        if (inactivityTimeout) clearTimeout(inactivityTimeout);
        resolve(results);
      }
    })();
  });
}

async function runTests() {
  console.log("🚀 Testing Mistral LLM Provider\n");

  if (!process.env.MISTRAL_API_KEY) {
    console.log("⚠️  Skipping Mistral - MISTRAL_API_KEY not set");
    console.log("\nTo run tests, set the environment variable:");
    console.log("export MISTRAL_API_KEY=your_key_here");
    return false;
  }

  const provider = new MistralLLM({
    provider: "mistral",
    apiKey: process.env.MISTRAL_API_KEY,
    model: "mistral-small-latest",
    temperature: 0.1,
  });

  let passed = 0;
  let total = 0;

  // Test 1: Generate simple message
  total++;
  console.log("\n📝 Test 1: Generate Message");
  try {
    const messages = [
      createMessage("system", "Respond with exactly 'Hello World'"),
      createMessage("user", "Say hello"),
    ];

    const job = await provider.generateMessage({ messages, tools: [] });
    const result = await consumeStream(job, 8000);

    if (result.error) {
      console.log(`❌ Generate Message: ${result.error}`);
    } else if (result.content.length > 0) {
      console.log(`✅ Generate Message: "${result.content.trim()}"`);
      passed++;
    } else {
      console.log("❌ Generate Message: No response received");
    }
  } catch (error) {
    console.log(`❌ Generate Message: ${error}`);
  }

  // Test 2: Generate object
  total++;
  console.log("\n📦 Test 2: Generate Object");
  try {
    const messages = [
      createMessage("system", "Respond with valid JSON only"),
      createMessage("user", "Create a person with name 'John' and age 25"),
    ];

    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const result = await provider.generateObject({ messages, schema });

    if (result.success && result.data && typeof result.data === "object") {
      console.log(`✅ Generate Object: ${JSON.stringify(result.data)}`);
      passed++;
    } else {
      console.log(
        `❌ Generate Object: ${result.success ? "Invalid data structure" : result.error}`,
      );
    }
  } catch (error) {
    console.log(`❌ Generate Object: ${error}`);
  }

  // Test 3: Single tool calling
  total++;
  console.log("\n🔧 Test 3: Single Tool Calling");
  try {
    const messages = [
      createMessage("system", "Use the search tool when asked to search. Be concise."),
      createMessage("user", "Search for TypeScript documentation"),
    ];

    const tools = [createSearchTool()];
    const job = await provider.generateMessage({ messages, tools });
    const result = await consumeStream(job, 15_000);

    if (result.error) {
      console.log(`❌ Single Tool: ${result.error}`);
    } else if (result.toolsCalled > 0) {
      const toolDetails = result.tools.map((t) => `${t.id}(${JSON.stringify(t.input)})`).join(", ");
      console.log(`✅ Single Tool: ${result.toolsCalled} tool(s) called - ${toolDetails}`);
      console.log(`   Content generated: ${result.hasContent ? "Yes" : "No"}`);
      passed++;
    } else {
      console.log("❌ Single Tool: No tools called");
      console.log(`   Content generated: ${result.hasContent ? "Yes" : "No"}`);
    }
  } catch (error) {
    console.log(`❌ Single Tool: ${error}`);
  }

  // Test 4: Parallel tool calling
  total++;
  console.log("\n⚡ Test 4: Parallel Tool Calling");
  try {
    const messages = [
      createMessage(
        "system",
        "You have access to search and calculator tools. When asked to get multiple pieces of information, use multiple tools efficiently.",
      ),
      createMessage(
        "user",
        "I need you to: 1) Search for 'AI news' and 2) Calculate 15 * 23. Please do both.",
      ),
    ];

    const tools = [createSearchTool(), createCalculatorTool()];
    const job = await provider.generateMessage({ messages, tools });
    const result = await consumeStream(job, 20_000);

    if (result.error) {
      console.log(`❌ Parallel Tools: ${result.error}`);
    } else {
      const uniqueTools = new Set(result.tools.map((t) => t.id));
      const isParallel = uniqueTools.size >= 2;

      if (result.toolsCalled >= 2 && isParallel) {
        const toolDetails = result.tools
          .map((t) => `${t.id}(${JSON.stringify(t.input)})`)
          .join(", ");
        console.log(
          `✅ Parallel Tools: ${result.toolsCalled} tool(s) called across ${uniqueTools.size} types`,
        );
        console.log(`   Tools: ${toolDetails}`);
        passed++;
      } else if (result.toolsCalled > 0) {
        const toolDetails = result.tools
          .map((t) => `${t.id}(${JSON.stringify(t.input)})`)
          .join(", ");
        console.log(
          `⚠️  Partial Tools: ${result.toolsCalled} tool(s), ${uniqueTools.size} types - ${toolDetails}`,
        );
        passed += 0.5;
      } else {
        console.log("❌ Parallel Tools: No tools called");
      }
      console.log(`   Content generated: ${result.hasContent ? "Yes" : "No"}`);
    }
  } catch (error) {
    console.log(`❌ Parallel Tools: ${error}`);
  }

  console.log(
    `\n📊 Mistral Results: ${passed}/${total} tests passed (${Math.round((passed / total) * 100)}%)`,
  );

  return passed === total;
}

export { runTests };

if (require.main === module) {
  runTests();
}
