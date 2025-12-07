import { describe } from "vitest";
import { createTelemetryClient } from "../clients/browser";
import { createConsumerTests } from "./common/consumers";
import type { TestContext } from "./common/utils";

const context: TestContext = {
  createClient: () => createTelemetryClient("client", {}),
  expectedPlatform: "browser",
  supportsSpanHierarchy: false,
};

describe("Browser", () => {
  createConsumerTests(context);
});
