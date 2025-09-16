import { describe } from "vitest";
import { createTelemetryClient } from "../clients/browser";
import { createTracingTests } from "./common/tracing";
import type { TestContext } from "./common/utils";

const context: TestContext = {
  createClient: () => createTelemetryClient("client", {}),
  expectedPlatform: "browser",
  supportsSpanHierarchy: false,
};

describe("Browser", () => {
  createTracingTests(context);
});
