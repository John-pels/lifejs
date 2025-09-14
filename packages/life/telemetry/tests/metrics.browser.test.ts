import { describe } from "vitest";
import { createTelemetryClient } from "../clients/browser";
import { createMetricsTests } from "./common/metrics";
import type { TestContext } from "./common/utils";

const context: TestContext = {
  createClient: () => createTelemetryClient("client", {}),
  expectedPlatform: "browser",
  supportsSpanHierarchy: false,
};

describe("Browser", () => {
  createMetricsTests(context);
});
