import { z } from "zod";
import type { Message, ToolDefinition } from "@/shared/resources";
import { OpenAILLM } from "../providers/openai";
import { XaiLLM } from "../providers/xai";

// Provider instances
const providers = [
  {
    name: "OpenAI",
    instance: process.env.OPENAI_API_KEY
      ? new OpenAILLM({
          provider: "openai",
          apiKey: process.env.OPENAI_API_KEY,
          model: "gpt-4o-mini",
          temperature: 0.1,
        })
      : null,
    envVar: "OPENAI_API_KEY",
  },
  {
    name: "xAI",
    instance: process.env.XAI_API_KEY
      ? new XaiLLM({
          provider: "xai",
          apiKey: process.env.XAI_API_KEY,
          model: "grok-3-mini",
          temperature: 0.1,
        })
      : null,
    envVar: "XAI_API_KEY",
  },
];

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
    inputSchema: z.object({
      query: z.string().describe("The search query"),
    }),
    outputSchema: z.object({
      result: z.string().describe("The search result"),
    }),
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
    inputSchema: z.object({
      expression: z.string().describe("Mathematical expression to evaluate"),
    }),
    outputSchema: z.object({
      result: z.number().describe("The calculation result"),
    }),
    run: async () => ({ success: true, output: { result: Math.random() * 100 } }),
  };
}

function createWeatherTool(): ToolDefinition {
  return {
    name: "weather",
    description: "Get weather information for a location",
    inputSchema: z.object({
      location: z.string().describe("The location to get weather for"),
    }),
    outputSchema: z.object({
      temperature: z.number().describe("Temperature in Celsius"),
      condition: z.string().describe("Weather condition"),
    }),
    run: async () => ({
      success: true,
      temperature: Math.round(Math.random() * 30 + 10),
      condition: "Sunny",
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
    tools: [] as Array<{ name: string; input: unknown }>,
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
        // If tools were called and no chunks for 1 second, consider complete
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
            const tool = chunk.tool as { name: string; input: unknown } | undefined;
            results.tools.push({ name: tool?.name || "unknown", input: tool?.input });
            results.toolsCalled++;
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

interface ProviderConfig {
  name: string;
  instance: OpenAILLM | XaiLLM | null;
  envVar: string;
}

async function testProvider(providerConfig: ProviderConfig) {
  const { name, instance, envVar } = providerConfig;

  console.log(`\n🧪 Testing ${name} Provider`);

  if (!instance) {
    console.log(`⚠️  Skipping ${name} - ${envVar} not set`);
    return { passed: 0, total: 0 };
  }

  const provider = instance;
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
      const toolDetails = result.tools
        .map((t) => `${t.name}(${JSON.stringify(t.input)})`)
        .join(", ");
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
        "You have access to search, calculator, and weather tools. When asked to get multiple pieces of information, use multiple tools efficiently.",
      ),
      createMessage(
        "user",
        "I need you to: 1) Search for 'AI news', 2) Calculate 15 * 23, and 3) Get weather for London. Please do all of these.",
      ),
    ];

    const tools = [createSearchTool(), createCalculatorTool(), createWeatherTool()];
    const job = await provider.generateMessage({ messages, tools });
    const result = await consumeStream(job, 20_000);

    if (result.error) {
      console.log(`❌ Parallel Tools: ${result.error}`);
    } else {
      const uniqueTools = new Set(result.tools.map((t) => t.name));
      const isParallel = uniqueTools.size >= 2;

      if (result.toolsCalled >= 2 && isParallel) {
        const toolDetails = result.tools
          .map((t) => `${t.name}(${JSON.stringify(t.input)})`)
          .join(", ");
        console.log(
          `✅ Parallel Tools: ${result.toolsCalled} tool(s) called across ${uniqueTools.size} types`,
        );
        console.log(`   Tools: ${toolDetails}`);
        passed++;
      } else if (result.toolsCalled > 0) {
        const toolDetails = result.tools
          .map((t) => `${t.name}(${JSON.stringify(t.input)})`)
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

  // Test 5: Tool chaining
  total++;
  console.log("\n🔗 Test 5: Tool Chaining");
  try {
    const messages = [
      createMessage(
        "system",
        "First search for information, then use the calculator if you find numbers.",
      ),
      createMessage(
        "user",
        "Search for 'population of Tokyo' and then calculate 10% of that number",
      ),
    ];

    const tools = [createSearchTool(), createCalculatorTool()];
    const job = await provider.generateMessage({ messages, tools });
    const result = await consumeStream(job, 25_000);

    if (result.error) {
      console.log(`❌ Tool Chaining: ${result.error}`);
    } else if (result.toolsCalled >= 1) {
      const sequence = result.tools.map((t) => t.name).join(" → ");
      console.log(`✅ Tool Chaining: ${result.toolsCalled} tool(s) called`);
      console.log(`   Sequence: ${sequence}`);
      console.log(`   Content generated: ${result.hasContent ? "Yes" : "No"}`);
      passed++;
    } else {
      console.log("❌ Tool Chaining: No tools called");
      console.log(`   Content generated: ${result.hasContent ? "Yes" : "No"}`);
    }
  } catch (error) {
    console.log(`❌ Tool Chaining: ${error}`);
  }

  console.log(
    `\n📊 ${name} Results: ${passed}/${total} tests passed (${Math.round((passed / total) * 100)}%)`,
  );
  return { passed, total };
}

async function runTests() {
  console.log("🚀 Testing LLM Providers\n");
  console.log("This test suite checks:");
  console.log("• Basic message generation");
  console.log("• Structured object generation");
  console.log("• Single tool calling");
  console.log("• Parallel tool calling");
  console.log("• Tool chaining capabilities");

  let totalPassed = 0;
  let totalTests = 0;
  let testedProviders = 0;

  for (const provider of providers) {
    // biome-ignore lint/performance/noAwaitInLoops: expected here
    const { passed, total } = await testProvider(provider);
    totalPassed += passed;
    totalTests += total;
    if (total > 0) testedProviders++;
  }

  if (testedProviders === 0) {
    console.log("\n🔑 No API keys found!");
    console.log("To run tests, set one or more of these environment variables:");
    for (const provider of providers) {
      console.log(`• ${provider.envVar} for ${provider.name} testing`);
    }
    console.log("\nExample:");
    console.log("export OPENAI_API_KEY=your_key_here");
    console.log("export XAI_API_KEY=your_key_here");
  } else {
    console.log(
      `\n🎯 Final Results: ${totalPassed}/${totalTests} tests passed across ${testedProviders} provider(s)`,
    );
    console.log(`Overall success rate: ${Math.round((totalPassed / totalTests) * 100)}%`);
  }

  return totalPassed === totalTests;
}

export { runTests };

await runTests();
