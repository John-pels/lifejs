import { describe } from "vitest";
import { createTelemetryClient } from "../clients/node";
import { createTracingTests } from "./common/tracing";
import type { TestContext } from "./common/utils";

const context: TestContext = {
  createClient: () => createTelemetryClient("cli", { command: "test", args: [] }),
  expectedPlatform: "node",
  supportsSpanHierarchy: true,
};

describe("Node.js", () => {
  createTracingTests(context);
});
