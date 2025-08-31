// @ts-nocheck

import { LivekitEOU } from "../../../../packages/life/models/eou/providers/livekit";
import { TurnSenseEOU } from "../../../../packages/life/models/eou/providers/turnsense";
import { TEST_CASES } from "./dataset";

// Performance metrics for latency analysis
interface PerformanceMetrics {
  averageLatency: number;
  minLatency: number;
  maxLatency: number;
  medianLatency: number;
  standardDeviation: number;
  totalInferences: number;
}

// Benchmark result structure
interface BenchmarkResult {
  modelName: string;
  accuracy: number;
  averageError: number;
  performance: PerformanceMetrics;
  categoryResults: Map<string, { accuracy: number; averageError: number; count: number }>;
  results: Array<{
    testCase: string;
    expected: number;
    predicted: number;
    error: number;
    category: string;
    latency: number;
  }>;
}

// Test cases are now imported from dataset.ts for better organization

// Calculate accuracy and error metrics
function calculateMetrics(results: Array<{ expected: number; predicted: number }>): {
  accuracy: number;
  averageError: number;
} {
  const accuracy =
    results.filter((r) => Math.abs(r.expected - r.predicted) <= 0.2).length / results.length;
  const averageError =
    results.reduce((sum, r) => sum + Math.abs(r.expected - r.predicted), 0) / results.length;
  return { accuracy, averageError };
}

// Calculate performance metrics
function calculatePerformanceMetrics(latencies: number[]): PerformanceMetrics {
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = latencies.reduce((a, b) => a + b, 0);
  const mean = sum / latencies.length;
  const variance = latencies.reduce((acc, val) => acc + (val - mean) ** 2, 0) / latencies.length;

  return {
    averageLatency: mean,
    minLatency: Math.min(...latencies),
    maxLatency: Math.max(...latencies),
    medianLatency: sorted[Math.floor(sorted.length / 2)] || 0,
    standardDeviation: Math.sqrt(variance),
    totalInferences: latencies.length,
  };
}

// Calculate per-category metrics
function calculateCategoryMetrics(
  results: Array<{ expected: number; predicted: number; category: string }>,
): Map<string, { accuracy: number; averageError: number; count: number }> {
  const categoryMap = new Map<string, Array<{ expected: number; predicted: number }>>();

  for (const result of results) {
    if (!categoryMap.has(result.category)) {
      categoryMap.set(result.category, []);
    }
    const categoryArray = categoryMap.get(result.category);
    if (categoryArray) {
      categoryArray.push({ expected: result.expected, predicted: result.predicted });
    }
  }

  const categoryResults = new Map<
    string,
    { accuracy: number; averageError: number; count: number }
  >();

  for (const [category, categoryResults_] of categoryMap) {
    const metrics = calculateMetrics(categoryResults_);
    categoryResults.set(category, {
      accuracy: metrics.accuracy,
      averageError: metrics.averageError,
      count: categoryResults_.length,
    });
  }

  return categoryResults;
}

// Benchmark a single model
async function benchmarkModel(
  model: LivekitEOU | TurnSenseEOU,
  modelName: string,
): Promise<BenchmarkResult> {
  console.log(`\n🔄 Testing ${modelName}...`);

  const results: Array<{
    testCase: string;
    expected: number;
    predicted: number;
    error: number;
    category: string;
    latency: number;
  }> = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const testCase = TEST_CASES[i];
    if (!testCase) continue;

    const start = performance.now();

    try {
      const prediction = await model.predict(testCase.messages);
      const end = performance.now();
      const latency = end - start;

      const error = Math.abs(testCase.expected - prediction);

      results.push({
        testCase: testCase.name,
        expected: testCase.expected,
        predicted: prediction,
        error,
        category: testCase.category,
        latency,
      });

      // Progress indicator
      if ((i + 1) % 10 === 0 || i === TEST_CASES.length - 1) {
        process.stdout.write(`\r   Progress: ${i + 1}/${TEST_CASES.length} tests completed`);
      }
    } catch (error) {
      console.error(`\n❌ Error testing ${testCase.name}:`, error);
      // Add a failed result with high error
      results.push({
        testCase: testCase.name,
        expected: testCase.expected,
        predicted: 0.5, // neutral prediction for failed cases
        error: 0.5,
        category: testCase.category,
        latency: 0,
      });
    }
  }

  console.log(); // New line after progress

  const overallMetrics = calculateMetrics(results);
  const latencies = results.map((r) => r.latency).filter((l) => l > 0); // Filter out failed cases
  const performanceMetrics = calculatePerformanceMetrics(latencies);
  const categoryResults = calculateCategoryMetrics(results);

  return {
    modelName,
    accuracy: overallMetrics.accuracy,
    averageError: overallMetrics.averageError,
    performance: performanceMetrics,
    categoryResults,
    results,
  };
}

// Helper function to create table rows
function createTableRow(headers: string[], values: string[], widths: number[]): string {
  return `| ${values.map((val, i) => val.padEnd(widths[i] || 10)).join(" | ")} |`;
}

function createTableSeparator(widths: number[]): string {
  return `|${widths.map((w) => "-".repeat(w + 2)).join("|")}|`;
}

// Print detailed benchmark results
function printDetailedResults(benchmarkResults: BenchmarkResult[]): void {
  console.log(`\n${"=".repeat(80)}`);
  console.log("📊 EOU MODEL BENCHMARK RESULTS");
  console.log("=".repeat(80));

  // Sort results by accuracy (highest first)
  const sortedResults = [...benchmarkResults].sort((a, b) => b.accuracy - a.accuracy);

  // Main results table
  console.log("\n🎯 OVERALL RESULTS (Sorted by Accuracy)");
  const headers = ["Model", "Avg Accuracy", "Accuracy Range", "Avg Latency", "Latency Range"];
  const widths = [25, 12, 15, 12, 15];

  console.log(createTableRow(headers, headers, widths));
  console.log(createTableSeparator(widths));

  for (const result of sortedResults) {
    const accuracyPercent = `${(result.accuracy * 100).toFixed(1)}%`;
    const accuracyRange = "(0%-100%)";
    const latencyMs = `${result.performance.averageLatency.toFixed(1)}ms`;
    const latencyRange = `(${result.performance.minLatency.toFixed(1)}-${result.performance.maxLatency.toFixed(1)}ms)`;

    const values = [result.modelName, accuracyPercent, accuracyRange, latencyMs, latencyRange];
    console.log(createTableRow(headers, values, widths));
  }

  // Context analysis (maxMessages impact)
  console.log("\n🧠 CONTEXT ANALYSIS");
  console.log(
    "Different maxMessages configurations show varying performance patterns across models.",
  );

  // Category performance
  console.log("\n📋 CATEGORY PERFORMANCE");
  const categories = new Set<string>();
  for (const result of benchmarkResults) {
    for (const [category] of result.categoryResults) {
      categories.add(category);
    }
  }

  for (const category of Array.from(categories).sort()) {
    console.log(`\n${category}:`);
    // Sort by accuracy for each category too
    const categoryResults = benchmarkResults
      .map((result) => ({
        name: result.modelName,
        categoryResult: result.categoryResults.get(category),
      }))
      .filter((item) => item.categoryResult)
      .sort((a, b) => (b.categoryResult?.accuracy || 0) - (a.categoryResult?.accuracy || 0));

    for (const { name, categoryResult } of categoryResults) {
      if (categoryResult) {
        const accuracy = `${(categoryResult.accuracy * 100).toFixed(1)}%`;
        console.log(`  ${name}: ${accuracy} (${categoryResult.count} tests)`);
      }
    }
  }

  // Model family comparison
  console.log("\n🏆 KEY INSIGHTS");
  const bestOverall = sortedResults[0];
  const fastest = benchmarkResults.reduce((fastest, current) =>
    current.performance.averageLatency < fastest.performance.averageLatency ? current : fastest,
  );

  if (bestOverall) {
    console.log(
      `• Best Accuracy: ${bestOverall.modelName} (${(bestOverall.accuracy * 100).toFixed(1)}%)`,
    );
  }
  console.log(
    `• Fastest Model: ${fastest.modelName} (${fastest.performance.averageLatency.toFixed(1)}ms)`,
  );
  console.log(`• Dataset Size: ${TEST_CASES.length} rich conversation scenarios`);
  console.log("• Performance varies significantly by context length and quantization");
}

// Main benchmark runner
async function runBenchmark(): Promise<void> {
  console.log("🚀 Starting EOU Model Benchmark");
  console.log(`📊 Testing ${TEST_CASES.length} conversation scenarios`);

  // Test configurations: different maxMessages values
  const maxMessagesConfigs = [1, 2, 5, 10];
  const benchmarkResults: BenchmarkResult[] = [];

  // Test each configuration individually to avoid caching issues
  for (const maxMessages of maxMessagesConfigs) {
    console.log(`\n📋 Testing with maxMessages = ${maxMessages}`);

    // Create fresh instances for each test to avoid potential caching
    const livekitFull = new LivekitEOU({ maxMessages, quantized: false });
    const livekitQuantized = new LivekitEOU({ maxMessages, quantized: true });
    const turnsenseFull = new TurnSenseEOU({ maxMessages, quantized: false });
    const turnsenseQuantized = new TurnSenseEOU({ maxMessages, quantized: true });

    // Test LiveKit models
    benchmarkResults.push(await benchmarkModel(livekitFull, `LiveKit Full ${maxMessages}msg`));
    benchmarkResults.push(
      await benchmarkModel(livekitQuantized, `LiveKit Quantized ${maxMessages}msg`),
    );

    // Test TurnSense models
    benchmarkResults.push(await benchmarkModel(turnsenseFull, `TurnSense Full ${maxMessages}msg`));
    benchmarkResults.push(
      await benchmarkModel(turnsenseQuantized, `TurnSense Quantized ${maxMessages}msg`),
    );
  }

  // Print results
  printDetailedResults(benchmarkResults);

  console.log("\n✅ Benchmark completed!");
  console.log("\n💡 Quick Guide:");
  console.log("• For real-time applications: Choose models with lowest latency");
  console.log("• For accuracy-critical tasks: Choose models with highest accuracy");
  console.log("• Consider the context length (maxMessages) impact on performance");
}

// Run the benchmark
runBenchmark().catch(console.error);
