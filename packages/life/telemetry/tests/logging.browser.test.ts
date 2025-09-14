import { describe } from "vitest";
import { createTelemetryClient } from "../clients/browser";
import { createLoggingTests } from "./common/logging";
import type { TestContext } from "./common/utils";

const context: TestContext = {
  createClient: () => createTelemetryClient("client", {}),
  expectedPlatform: "browser",
  supportsSpanHierarchy: false,
};

describe("Browser", () => {
  createLoggingTests(context);
});
