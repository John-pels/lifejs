import { describe } from "vitest";
import { createTelemetryClient } from "../clients/node";
import { createMetricsTests } from "./common/metrics";
import type { TestContext } from "./common/utils";

const context: TestContext = {
  createClient: () => createTelemetryClient("cli", { command: "test", args: [] }),
  expectedPlatform: "node",
  supportsSpanHierarchy: true,
};

describe("Node.js", () => {
  createMetricsTests(context);
});
