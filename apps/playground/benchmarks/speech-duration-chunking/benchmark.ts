// @ts-nocheck
// Generate a test audio chunk with Cartesia with the text "How beautiful Life is? Are you talking about the Typescript framework? Let me know if I can be of any help, and would love to know how I can help you."
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CartesiaClient } from "@cartesia/cartesia-js";
import type { StreamingResponse } from "@cartesia/cartesia-js/api";
import { charsTokenizer } from "./tokenizers/chars-tokenizer";
import { hyphenTokenizer } from "./tokenizers/hyphen-tokenizer";
import { lifeHyphenTokenizer } from "./tokenizers/life-hyphen-tokenizer";
import { syllableTokenizer } from "./tokenizers/syllable-tokenizer";
import { wordsTokenizer } from "./tokenizers/words-tokenizer";
import { SpokenTextTokenizer } from "./tokenizers/old";
import { speechDurationTokenizer } from "./../../../../packages/life/models/tts/lib/speech-duration-tokenizer";
import { speechTokenizer } from "../../../../packages/life/models/tts/lib/duration-tokenizer";

// Configuration
const SAMPLE_RATE = 16000;
const AUDIO_CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), "audio");

// Ensure audio directory exists
if (!existsSync(AUDIO_CACHE_DIR)) {
  mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
}

const oldChunker = new SpokenTextTokenizer();

// Tokenizer scenarios to test - now properly handling different return types
const scenarios = {
  chars: (text: string) => charsTokenizer(text).length,
  words: (text: string) => wordsTokenizer(text, false).length,
  "words-ignore-punct": (text: string) => wordsTokenizer(text, true).length,
  hyphen: (text: string) => hyphenTokenizer(text).length,
  "life-hyphen": (text: string) => lifeHyphenTokenizer(text).length,
  syllable: (text: string) => syllableTokenizer(text).length,
  "old-chunker": (text: string) => oldChunker.weight(text),
  "new-tokenizer": async (text: string) => {
    const [error, tokens] = await speechDurationTokenizer.tokenize(text);
    if (error) return 0;
    return tokens?.length ?? 0;
  },
};

// Test sentences of varying lengths
const testSentences = [
  "How beautiful Life is?",
  "Are you talking about the Typescript framework?",
  "Let me know if I can be of any help, and would love to know how I can help you.",
  "This costs $29.99, but in Europe it's €35.50 or £28.75.",
  "The temperature is 98.6° Fahrenheit (37° Celsius), which is normal.",
  "I need 2 + 3 = 5 apples, but you have 10 × 2 = 20 oranges instead.",
  "Wait... are you sure? Yes! I'm 100% certain about this.",
  'She said: "Meet me at 3:30 PM; don\'t be late!" — but I was.',
  "The equation is x² + y² = z² (Pythagorean theorem).",
  "Contact us at support@company.com or call 1-800-555-0123.",
  "This is a short sentence.",
  "This is a much longer sentence that contains multiple clauses and should take significantly more time to speak when converted to audio.",
  "WebRTC enables real-time communication between browsers and mobile applications.",
  "The quick brown fox jumps over the lazy dog in the moonlight.",
  "Life.js leverages WebRTC to bi-directionally stream data between agents and users, enabling low-latency parallel streaming.",
  "Compared to most agent frameworks relying on WebSockets or HTTP Streaming, Life.js uses LiveKit WebRTC infrastructure with SFU and worldwide relays.",
  'Hey, I\'ve $20 in my pocket (€10). I wonder... why he said "Get out"!',
  "The stock price increased by 15% today, from $45.30 to $52.10 per share.",
  "She bought 3 items: bread ($2.50), milk ($3.99), and eggs ($4.25) — total: $10.74.",
  "The formula is: force = mass × acceleration (F = m × a).",
  '«Bonjour!» she said in French, then switched to English: "Hello there!"',
  "The meeting is scheduled for 2:30 PM... or was it 3:00 PM?", 
  "I have ¥1,000 in Japanese currency and ₹500 in Indian rupees.",
  "The angle is 45°, which equals π ÷ 4 radians approximately.", // tokenizer performs bad on this one
  'She whispered: "The secret code is 007..." and then disappeared.',
  "Buy 2 get 1 free! That's a 33.33% discount on the third item.",
  "Temperature ranges: -10° to +25° Celsius (14° to 77° Fahrenheit).", 
  "The recipe calls for 2½ cups flour & 1¾ cups sugar... mix well!",
  "Question: Is 7 > 5 and 3 < 8? Answer: Yes, both statements are true.",
  // Markdown test sentences
  "# Life.js Framework\n\nLife.js is an **open-source** framework for building *agentic* applications.",
  "Check out [the documentation](https://lifejs.org/docs) for more details about `defineAgent()` and plugins.",
  "## Features\n\n- Real-time WebRTC streaming\n- Plugin-based architecture\n- Voice and text interactions",
  "The formula for velocity is $$v = \\frac{d}{t}$$ where $$d$$ is distance and $$t$$ is time.",
  "Here is a code block:\n```typescript\nconst agent = defineAgent({\n  name: \"Assistant\",\n  plugins: [generation()]\n});\n```",
  "Here is a table:\n| Feature | Status | Priority |\n|---------|--------|----------|\n| WebRTC | ✅ Done | High |\n| Plugins | 🚧 In Progress | Medium |",
  "> This is a blockquote.\n> It can span multiple lines\n> and supports **formatting**.",
  "The quadratic formula is $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$ which solves $$ax^2 + bx + c = 0$$.",
  "- [x] Implement WebRTC transport\n- [x] Add plugin system\n- [ ] Write documentation\n- [ ] Create examples",
  "Use `npm install life` or `bun add life` to get started. The package exports `defineAgent` from `life/server`.",
  "**Important**: The `Transport` class handles WebRTC connections. See `packages/life/transport/` for details.",
  "Here is a mermaid diagram:\n```mermaid\ngraph TD\n    A[User] -->|WebRTC| B[Agent]\n    B -->|Stream| C[Generation Plugin]\n    C -->|Response| B\n```",
  "Visit https://lifejs.org for the website, or check [GitHub](https://github.com/lifejs/life) for source code.",
  "The matrix multiplication $$\\mathbf{C} = \\mathbf{A} \\times \\mathbf{B}$$ requires $$O(n^3)$$ operations.",
  "1. First, install dependencies: `bun install`\n2. Then, configure your agent in `life.config.ts`\n3. Finally, run `bun dev` to start",
  "~~Old API~~ New API: Use `life/client` for client-side code and `life/server` for agent definitions.",
  "### Configuration\n\n```typescript\n// life.config.ts\nexport default defineConfig({\n  models: { /* ... */ }\n});\n```",
  "The integral $$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$ is known as the Gaussian integral.",
  "Here is a table:\n| Component | Description | Location |\n|-----------|-------------|----------|\n| Agent | Core definition | `agent/` |\n| Transport | WebRTC abstraction | `transport/` |\n| Models | LLM/TTS/STT APIs | `models/` |",
  "**Bold text**, *italic text*, `code`, [links](url), and ~~strikethrough~~ all work in Markdown.",
  "Here is a mermaid sequence diagram:\n```mermaid\nsequenceDiagram\n    participant U as User\n    participant A as Agent\n    U->>A: Audio Stream\n    A->>U: Text Response\n```",
  "The derivative $$\\frac{d}{dx}(x^n) = nx^{n-1}$$ and the sum $$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$ are fundamental.",
];

// Calibration text for establishing baseline ratios
const calibrationText =
  "What's you name? Are you talking about the Typescript framework? Let me know if I can be of any help, and would love to know how I can help you.";

interface BenchmarkResult {
  text: string;
  actualDurationMs: number;
  tokenCounts: Record<string, number>;
  estimates: Record<string, Record<string, number>>; // method -> tokenizer -> estimate
  errors: Record<string, Record<string, number>>;
  relativeErrors: Record<string, Record<string, number>>;
  directions: Record<string, Record<string, "higher" | "lower" | "exact">>;
}

interface AudioCacheEntry {
  text: string;
  durationMs: number;
  audioData: number[];
  timestamp: number;
}

interface DataPoint {
  text: string;
  durationMs: number;
  tokenCounts: Record<string, number>;
  timestamp: number;
}

interface AverageCalculators {
  initial: Record<string, number>;
  simple: Record<string, number>;
  weighted: Record<string, number>;
  movingWeighted: Record<string, number>;
}

// Moving window size for moving weighted average
const MOVING_WINDOW_SIZE = 5;

// Generate a hash for text to use as filename
function getTextHash(text: string): string {
  return createHash("md5").update(text).digest("hex");
}

// Get cached audio file path
function getCacheFilePath(text: string): string {
  const hash = getTextHash(text);
  return join(AUDIO_CACHE_DIR, `${hash}.json`);
}

// Load cached audio duration
function loadCachedAudio(text: string): number | null {
  try {
    const filePath = getCacheFilePath(text);
    if (!existsSync(filePath)) return null;

    const data = JSON.parse(readFileSync(filePath, "utf-8")) as AudioCacheEntry;
    if (data.text === text) {
      console.log(`  📁 Using cached audio (${data.durationMs.toFixed(2)}ms)`);
      return data.durationMs;
    }
  } catch (error) {
    console.warn(`  ⚠️ Failed to load cache: ${error}`);
  }
  return null;
}

// Save audio to cache
function saveCachedAudio(text: string, durationMs: number, audioData: Int16Array): void {
  try {
    const filePath = getCacheFilePath(text);
    const cacheEntry: AudioCacheEntry = {
      text,
      durationMs,
      audioData: Array.from(audioData),
      timestamp: Date.now(),
    };
    writeFileSync(filePath, JSON.stringify(cacheEntry, null, 2));
  } catch (error) {
    console.warn(`  ⚠️ Failed to save cache: ${error}`);
  }
}

// Simple wrapper for Cartesia TTS with caching
class SimpleTTS {
  private client = new CartesiaClient({ apiKey: process.env.CARTESIA_API_KEY });

  async generateAudio(text: string): Promise<number> {
    // Check cache first
    const cachedDuration = loadCachedAudio(text);
    if (cachedDuration !== null) {
      return cachedDuration;
    }

    console.log("  🎵 Generating new audio...");

    return new Promise((resolve, reject) => {
      const socket = this.client.tts.websocket({
        container: "raw",
        encoding: "pcm_s16le",
        sampleRate: SAMPLE_RATE,
      });

      let totalSamples = 0;
      let hasStarted = false;
      const audioChunks: Int16Array[] = [];

      socket
        .send({
          contextId: `benchmark-${Date.now()}`,
          modelId: "sonic-2",
          language: "en",
          voice: { mode: "id", id: "bf0a246a-8642-498a-9950-80c35e9276b5" },
          transcript: text,
          continue: false,
          outputFormat: {
            container: "raw",
            encoding: "pcm_s16le",
            sampleRate: SAMPLE_RATE,
          },
        })
        .then((response) => {
          response.on("message", (msgString: string) => {
            try {
              const msg = JSON.parse(msgString) as StreamingResponse;

              if (msg.type === "chunk") {
                hasStarted = true;
                const buf = Buffer.from(msg.data, "base64");
                const pcmBytes = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
                audioChunks.push(pcmBytes);
                totalSamples += pcmBytes.length;
              } else if (msg.type === "done") {
                const durationMs = (totalSamples / SAMPLE_RATE) * 1000;

                // Combine all audio chunks for caching
                const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
                const fullAudio = new Int16Array(totalLength);
                let offset = 0;
                for (const chunk of audioChunks) {
                  fullAudio.set(chunk, offset);
                  offset += chunk.length;
                }

                // Save to cache
                saveCachedAudio(text, durationMs, fullAudio);

                resolve(durationMs);
              } else if (msg.type === "error") {
                reject(new Error(`Cartesia error: ${msg.error}`));
              }
            } catch (error) {
              reject(error);
            }
          });
        })
        .catch(reject);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!hasStarted) {
          reject(new Error("Timeout: Audio generation did not start"));
        }
      }, 30000);
    });
  }
}

// Calculate duration estimates using different tokenizers and averaging methods
async function calculateEstimates(
  text: string,
  averageCalculators: AverageCalculators,
): Record<string, Record<string, number>> {
  const estimates: Record<string, Record<string, number>> = {
    initial: {},
    simple: {},
    weighted: {},
    movingWeighted: {},
  };

  for (const [scenarioName, tokenizer] of Object.entries(scenarios)) {
    const tokenCount = await tokenizer(text);

    // Calculate estimates for each averaging method
    for (const method of ["initial", "simple", "weighted", "movingWeighted"] as const) {
      const ratioPerMs = averageCalculators[method][scenarioName];
      if (ratioPerMs && ratioPerMs > 0) {
        estimates[method][scenarioName] = tokenCount / ratioPerMs;
      } else {
        estimates[method][scenarioName] = 0;
      }
    }
  }

  return estimates;
}

// Update averages with new data point
function updateAverages(averageCalculators: AverageCalculators, dataPoints: DataPoint[]): void {
  const scenarioNames = Object.keys(scenarios);

  for (const scenarioName of scenarioNames) {
    // Simple average
    const validPoints = dataPoints.filter(
      (dp) => dp.tokenCounts[scenarioName] != null && dp.durationMs > 0,
    );
    if (validPoints.length > 0) {
      const totalTokens = validPoints.reduce(
        (sum, dp) => sum + (dp.tokenCounts[scenarioName] || 0),
        0,
      );
      const totalDuration = validPoints.reduce((sum, dp) => sum + dp.durationMs, 0);
      averageCalculators.simple[scenarioName] = totalTokens / totalDuration;
    }

    // Weighted average (longer audio samples get more weight)
    if (validPoints.length > 0) {
      let weightedTokens = 0;
      let totalWeight = 0;

      for (const dp of validPoints) {
        const weight = dp.durationMs; // Weight by duration
        const tokenCount = dp.tokenCounts[scenarioName] || 0;
        weightedTokens += (tokenCount / dp.durationMs) * weight;
        totalWeight += weight;
      }

      if (totalWeight > 0) {
        averageCalculators.weighted[scenarioName] = weightedTokens / totalWeight;
      }
    }

    // Moving weighted average (recent + longer samples get more weight)
    const recentPoints = validPoints.slice(-MOVING_WINDOW_SIZE);
    if (recentPoints.length > 0) {
      let weightedTokens = 0;
      let totalWeight = 0;

      for (let i = 0; i < recentPoints.length; i++) {
        const dp = recentPoints[i];
        if (!dp) continue;
        const recencyWeight = (i + 1) / recentPoints.length; // More recent = higher weight
        const durationWeight = dp.durationMs; // Longer duration = higher weight
        const combinedWeight = recencyWeight * durationWeight;
        const tokenCount = dp.tokenCounts[scenarioName] || 0;

        weightedTokens += (tokenCount / dp.durationMs) * combinedWeight;
        totalWeight += combinedWeight;
      }

      if (totalWeight > 0) {
        averageCalculators.movingWeighted[scenarioName] = weightedTokens / totalWeight;
      }
    }
  }
}

// Format table row
function formatTableRow(columns: string[], widths: number[]): string {
  return `│ ${columns.map((col, i) => col.padEnd(widths[i] ?? 0)).join(" │ ")} │`;
}

// Format table separator
function formatTableSeparator(widths: number[]): string {
  return `├${widths.map((w) => "─".repeat(w + 2)).join("┼")}┤`;
}

// Format table header
function formatTableHeader(widths: number[]): string {
  return `┌${widths.map((w) => "─".repeat(w + 2)).join("┬")}┐`;
}

// Format table footer
function formatTableFooter(widths: number[]): string {
  return `└${widths.map((w) => "─".repeat(w + 2)).join("┴")}┘`;
}

// Display summary for a specific averaging method
function displaySummaryForMethod(
  results: BenchmarkResult[],
  method: keyof AverageCalculators,
): void {
  const scenarioNames = Object.keys(scenarios);
  const summaryStats: Record<
    string,
    {
      meanError: number;
      meanRelativeError: number;
      maxError: number;
      maxRelativeError: number;
      minError: number;
      minRelativeError: number;
      higherCount: number;
      lowerCount: number;
      exactCount: number;
      averageBias: number;
      biasDirection: "↑" | "↓" | "=";
    }
  > = {};

  for (const scenarioName of scenarioNames) {
    const errors = results
      .map((r) => r.errors[method]?.[scenarioName])
      .filter((e): e is number => e !== undefined);
    const relativeErrors = results
      .map((r) => r.relativeErrors[method]?.[scenarioName])
      .filter((e): e is number => e !== undefined);
    const directions = results
      .map((r) => r.directions[method]?.[scenarioName])
      .filter((d): d is "higher" | "lower" | "exact" => d !== undefined);

    // Calculate average bias (positive = overestimate, negative = underestimate)
    const signedErrors = results
      .map((r) => {
        const estimate = r.estimates[method]?.[scenarioName];
        const actual = r.actualDurationMs;
        return estimate && actual ? estimate - actual : 0;
      })
      .filter((e) => e !== 0);

    const averageBias =
      signedErrors.length > 0 ? signedErrors.reduce((a, b) => a + b, 0) / signedErrors.length : 0;

    if (errors.length > 0 && relativeErrors.length > 0) {
      summaryStats[scenarioName] = {
        meanError: errors.reduce((a, b) => a + b, 0) / errors.length,
        meanRelativeError: relativeErrors.reduce((a, b) => a + b, 0) / relativeErrors.length,
        maxError: Math.max(...errors),
        maxRelativeError: Math.max(...relativeErrors),
        minError: Math.min(...errors),
        minRelativeError: Math.min(...relativeErrors),
        higherCount: directions.filter((d) => d === "higher").length,
        lowerCount: directions.filter((d) => d === "lower").length,
        exactCount: directions.filter((d) => d === "exact").length,
        averageBias,
        biasDirection: Math.abs(averageBias) < 5 ? "=" : averageBias > 0 ? "↑" : "↓",
      };
    }
  }

  // Sort by mean relative error
  const sortedScenarios = scenarioNames
    .filter((name) => summaryStats[name])
    .sort((a, b) => {
      const statsA = summaryStats[a];
      const statsB = summaryStats[b];
      if (!statsA || !statsB) return 0;
      return statsA.meanRelativeError - statsB.meanRelativeError;
    });

  const summaryHeaders = [
    "Rank",
    "Tokenizer",
    "Avg Error",
    "Avg %",
    "Bias",
    "Higher",
    "Lower",
    "Exact",
  ];
  const summaryWidths = [4, 18, 10, 8, 10, 6, 6, 5];

  console.log(formatTableHeader(summaryWidths));
  console.log(formatTableRow(summaryHeaders, summaryWidths));
  console.log(formatTableSeparator(summaryWidths));

  sortedScenarios.forEach((scenarioName, index) => {
    const stats = summaryStats[scenarioName];
    if (!stats) return;

    const rank = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
    const biasText = `${stats.biasDirection}${Math.abs(stats.averageBias).toFixed(0)}ms`;

    const row = [
      rank,
      scenarioName,
      `${stats.meanError.toFixed(1)}ms`,
      `${stats.meanRelativeError.toFixed(1)}%`,
      biasText,
      stats.higherCount.toString(),
      stats.lowerCount.toString(),
      stats.exactCount.toString(),
    ];
    console.log(formatTableRow(row, summaryWidths));
  });

  console.log(formatTableFooter(summaryWidths));
}

// Display summary statistics table
function displaySummaryTable(results: BenchmarkResult[]): void {
  const scenarioNames = Object.keys(scenarios);
  const summaryStats: Record<
    string,
    {
      meanError: number;
      meanRelativeError: number;
      maxError: number;
      maxRelativeError: number;
      minError: number;
      minRelativeError: number;
      higherCount: number;
      lowerCount: number;
      exactCount: number;
      averageBias: number;
      biasDirection: "↑" | "↓" | "=";
    }
  > = {};

  for (const scenarioName of scenarioNames) {
    const errors = results
      .map((r) => r.errors[scenarioName][scenarioName])
      .filter((e): e is number => e !== undefined);
    const relativeErrors = results
      .map((r) => r.relativeErrors[scenarioName][scenarioName])
      .filter((e): e is number => e !== undefined);
    const directions = results.map((r) => r.directions[scenarioName][scenarioName]);

    // Calculate average bias (positive = overestimate, negative = underestimate)
    const signedErrors = results
      .map((r) => {
        const estimate = r.estimates[scenarioName][scenarioName];
        const actual = r.actualDurationMs;
        return estimate && actual ? estimate - actual : 0;
      })
      .filter((e) => e !== 0);

    const averageBias =
      signedErrors.length > 0 ? signedErrors.reduce((a, b) => a + b, 0) / signedErrors.length : 0;

    if (errors.length > 0 && relativeErrors.length > 0) {
      summaryStats[scenarioName] = {
        meanError: errors.reduce((a, b) => a + b, 0) / errors.length,
        meanRelativeError: relativeErrors.reduce((a, b) => a + b, 0) / relativeErrors.length,
        maxError: Math.max(...errors),
        maxRelativeError: Math.max(...relativeErrors),
        minError: Math.min(...errors),
        minRelativeError: Math.min(...relativeErrors),
        higherCount: directions.filter((d) => d === "higher").length,
        lowerCount: directions.filter((d) => d === "lower").length,
        exactCount: directions.filter((d) => d === "exact").length,
        averageBias,
        biasDirection: Math.abs(averageBias) < 5 ? "=" : averageBias > 0 ? "↑" : "↓",
      };
    }
  }

  // Sort by mean relative error
  const sortedScenarios = scenarioNames
    .filter((name) => summaryStats[name])
    .sort((a, b) => {
      const statsA = summaryStats[a];
      const statsB = summaryStats[b];
      if (!statsA || !statsB) return 0;
      return statsA.meanRelativeError - statsB.meanRelativeError;
    });

  console.log("\n🏆 TOKENIZER PERFORMANCE RANKING");
  console.log("=".repeat(90));

  const summaryHeaders = [
    "Rank",
    "Tokenizer",
    "Avg Error",
    "Avg %",
    "Bias",
    "Higher",
    "Lower",
    "Exact",
  ];
  const summaryWidths = [4, 18, 10, 8, 10, 6, 6, 5];

  console.log(formatTableHeader(summaryWidths));
  console.log(formatTableRow(summaryHeaders, summaryWidths));
  console.log(formatTableSeparator(summaryWidths));

  sortedScenarios.forEach((scenarioName, index) => {
    const stats = summaryStats[scenarioName];
    if (!stats) return;

    const rank = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
    const biasText = `${stats.biasDirection}${Math.abs(stats.averageBias).toFixed(0)}ms`;

    const row = [
      rank,
      scenarioName,
      `${stats.meanError.toFixed(1)}ms`,
      `${stats.meanRelativeError.toFixed(1)}%`,
      biasText,
      stats.higherCount.toString(),
      stats.lowerCount.toString(),
      stats.exactCount.toString(),
    ];
    console.log(formatTableRow(row, summaryWidths));
  });

  console.log(formatTableFooter(summaryWidths));

  // Legend
  console.log("\n📋 LEGEND:");
  console.log("• ↑ = Estimate higher than actual duration");
  console.log("• ↓ = Estimate lower than actual duration");
  console.log("• = = Estimate matches actual duration");
  console.log("• Bias = Average tendency to over(↑) or under(↓) estimate with magnitude");
  console.log("• Higher/Lower/Exact = Count of over/under/exact estimates");
  console.log("• Avg Error = Mean absolute error in milliseconds");
  console.log("• Avg % = Mean relative error percentage");
}

// Main benchmark function
export async function runBenchmark(): Promise<void> {
  console.log("🚀 Starting TTS Duration Estimation Benchmark");
  console.log("=".repeat(60));
  console.log(`📁 Audio cache directory: ${AUDIO_CACHE_DIR}`);

  const tts = new SimpleTTS();

  try {
    // Initialize averaging calculators
    const averageCalculators: AverageCalculators = {
      initial: {},
      simple: {},
      weighted: {},
      movingWeighted: {},
    };

    // Data points for dynamic averaging
    const dataPoints: DataPoint[] = [];

    // Step 1: Generate calibration audio and establish baseline ratios
    console.log("\n📊 Calibrating with baseline text...");
    console.log(`Calibration text: "${calibrationText}"`);

    const calibrationDuration = await tts.generateAudio(calibrationText);
    console.log(`Actual duration: ${calibrationDuration.toFixed(2)}ms`);

    // Calculate token counts for calibration text
    const calibrationTokenCounts: Record<string, number> = {};
    for (const [scenarioName, tokenizer] of Object.entries(scenarios)) {
      calibrationTokenCounts[scenarioName] = await tokenizer(calibrationText);
      console.log(`${scenarioName}: ${calibrationTokenCounts[scenarioName]} tokens`);
    }

    // Initialize ratios with calibration data
    for (const scenarioName of Object.keys(scenarios)) {
      const tokenCount = calibrationTokenCounts[scenarioName];
      if (tokenCount) {
        averageCalculators.initial[scenarioName] = tokenCount / calibrationDuration;
        averageCalculators.simple[scenarioName] = tokenCount / calibrationDuration;
        averageCalculators.weighted[scenarioName] = tokenCount / calibrationDuration;
        averageCalculators.movingWeighted[scenarioName] = tokenCount / calibrationDuration;
        console.log(
          `${scenarioName}: ${averageCalculators.initial[scenarioName].toFixed(4)} tokens/ms (initial)`,
        );
      }
    }

    // Add calibration as first data point
    dataPoints.push({
      text: calibrationText,
      durationMs: calibrationDuration,
      tokenCounts: calibrationTokenCounts,
      timestamp: Date.now(),
    });

    console.log(`\n${"=".repeat(60)}`);
    console.log("🧪 Testing on sample sentences...");

    // Step 2: Test on all sentences
    const results: BenchmarkResult[] = [];

    for (let i = 0; i < testSentences.length; i++) {
      const text = testSentences[i];
      if (!text) continue;

      console.log(
        `\n[${i + 1}/${testSentences.length}] Testing: "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`,
      );

      try {
        // Generate actual audio duration
        const [errSpeechText, speechTokens] = await speechTokenizer.tokenize(text);
        if (errSpeechText) throw errSpeechText;
        const actualDuration = await tts.generateAudio(speechTokens.map((t) => t.value).join(""));
        console.log(`  Actual: ${actualDuration.toFixed(2)}ms`);

        // Calculate token counts for this text
        const tokenCounts: Record<string, number> = {};
        for (const [scenarioName, tokenizer] of Object.entries(scenarios)) {
          tokenCounts[scenarioName] = await tokenizer(text);
        }

        // Add to data points
        dataPoints.push({
          text,
          durationMs: actualDuration,
          tokenCounts,
          timestamp: Date.now(),
        });

        // Update averages with all data points so far
        updateAverages(averageCalculators, dataPoints);

        // Calculate estimates using all averaging methods
        const estimates = await calculateEstimates(text, averageCalculators);

        // Calculate errors and directions for each method
        const errors: Record<string, Record<string, number>> = {};
        const relativeErrors: Record<string, Record<string, number>> = {};
        const directions: Record<string, Record<string, "higher" | "lower" | "exact">> = {};

        for (const method of ["initial", "simple", "weighted", "movingWeighted"] as const) {
          errors[method] = {};
          relativeErrors[method] = {};
          directions[method] = {};

          for (const scenarioName of Object.keys(scenarios)) {
            const estimate = estimates[method][scenarioName] || 0;
            const error = Math.abs(estimate - actualDuration);
            const relativeError = (error / actualDuration) * 100;

            errors[method][scenarioName] = error;
            relativeErrors[method][scenarioName] = relativeError;

            // Determine direction (with small tolerance for "exact")
            const tolerance = 1; // 1ms tolerance
            if (Math.abs(estimate - actualDuration) <= tolerance) {
              directions[method][scenarioName] = "exact";
            } else if (estimate > actualDuration) {
              directions[method][scenarioName] = "higher";
            } else {
              directions[method][scenarioName] = "lower";
            }
          }
        }

        // Log estimates for initial method only (to avoid spam)
        console.log("  Estimates (initial method):");
        for (const scenarioName of Object.keys(scenarios)) {
          const estimate = estimates.initial[scenarioName] || 0;
          const error = errors.initial[scenarioName] || 0;
          const relativeError = relativeErrors.initial[scenarioName] || 0;
          const direction = directions.initial[scenarioName];
          const arrow = direction === "higher" ? "↑" : direction === "lower" ? "↓" : "=";
          console.log(
            `    ${scenarioName}: ${estimate.toFixed(2)}ms ${arrow} (error: ${error.toFixed(2)}ms, ${relativeError.toFixed(1)}%)`,
          );
        }

        results.push({
          text,
          actualDurationMs: actualDuration,
          tokenCounts,
          estimates,
          errors,
          relativeErrors,
          directions,
        });
      } catch (error) {
        console.error(`  ❌ Failed to process sentence: ${error}`);
      }

      // Small delay to avoid overwhelming the API
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Step 3: Display results for each averaging method
    console.log(`\n${"=".repeat(100)}`);
    console.log("📊 RESULTS BY AVERAGING METHOD");
    console.log("=".repeat(100));

    for (const method of ["initial", "simple", "weighted", "movingWeighted"] as const) {
      const methodName = {
        initial: "Initial Calibration",
        simple: "Simple Average",
        weighted: "Weighted Average",
        movingWeighted: "Moving Weighted Average",
      }[method];

      console.log(`\n🔍 ${methodName.toUpperCase()}`);
      console.log("-".repeat(60));

      displaySummaryForMethod(results, method);
    }

    console.log("\n✅ Benchmark completed successfully!");
    console.log(`📁 Audio files cached in: ${AUDIO_CACHE_DIR}`);
  } catch (error) {
    console.error("❌ Benchmark failed:", error);
    throw error;
  }
}

// Export for testing
export { calculateEstimates, scenarios };

runBenchmark();
