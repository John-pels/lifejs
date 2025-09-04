import { inspect } from "node:util";
import { config } from "dotenv";

// Load environment variables from .env file
config();

async function testAgentAPI() {
  const baseURL = "http://localhost:3003";
  const serverToken = process.env.LIFE_SERVER_TOKEN;

  if (!serverToken) {
    console.error("❌ LIFE_SERVER_TOKEN environment variable is not set");
    process.exit(1);
  }

  console.log("Testing Life.js Agent API...\n");

  try {
    // 0. Get server info
    console.log("0. Getting server info...");
    const serverInfoResponse = await fetch(`${baseURL}/server/info`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${serverToken}`,
      },
    });

    const serverInfoText = await serverInfoResponse.text();
    let serverInfo: unknown;
    try {
      serverInfo = JSON.parse(serverInfoText);
    } catch {
      serverInfo = serverInfoText;
    }

    if (!serverInfoResponse.ok) {
      console.error(
        "Server info error response:",
        inspect(serverInfo, { depth: null, colors: true }),
      );
      throw new Error(`Server info failed with status: ${serverInfoResponse.status}`);
    }
    console.log("✓ Server info retrieved!");
    console.log("Response:", inspect(serverInfo, { depth: null, colors: true }));

    // 1. Create agent
    console.log("\n1. Creating agent...");
    const createResponse = await fetch(`${baseURL}/agent/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agentName: "example",
        scope: {},
      }),
    });

    const createResponseText = await createResponse.text();
    // biome-ignore lint/suspicious/noExplicitAny: not needed
    let createResult: any;
    try {
      createResult = JSON.parse(createResponseText);
    } catch {
      createResult = createResponseText;
    }

    if (!createResponse.ok) {
      console.error(
        "Create agent error response:",
        inspect(createResult, { depth: null, colors: true }),
      );
      throw new Error(`Create failed with status: ${createResponse.status}`);
    }
    console.log("✓ Agent created successfully!");
    console.log("Response:", inspect(createResult, { depth: null, colors: true }));

    // Check if creation was successful and we have the required data
    if (!(createResult.success && createResult.agentId && createResult.sessionToken)) {
      throw new Error("Agent creation response missing required fields");
    }

    // 2. Get agent info before starting
    console.log("\n2. Getting agent info (before start)...");
    const infoBeforeResponse = await fetch(`${baseURL}/agent/info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agentId: createResult.agentId,
        sessionToken: createResult.sessionToken,
      }),
    });

    const infoBeforeText = await infoBeforeResponse.text();
    let infoBefore: unknown;
    try {
      infoBefore = JSON.parse(infoBeforeText);
    } catch {
      infoBefore = infoBeforeText;
    }

    if (!infoBeforeResponse.ok) {
      console.error(
        "Agent info (before) error response:",
        inspect(infoBefore, { depth: null, colors: true }),
      );
      throw new Error(`Agent info (before) failed with status: ${infoBeforeResponse.status}`);
    }
    console.log("✓ Agent info retrieved (before start)!");
    console.log("Response:", inspect(infoBefore, { depth: null, colors: true }));

    // 3. Start agent
    console.log("\n3. Starting agent...");
    const startResponse = await fetch(`${baseURL}/agent/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agentId: createResult.agentId,
        sessionToken: createResult.sessionToken,
      }),
    });

    const startResponseText = await startResponse.text();
    // biome-ignore lint/suspicious/noExplicitAny: not needed
    let startResult: any;
    try {
      startResult = JSON.parse(startResponseText);
    } catch {
      startResult = startResponseText;
    }

    if (!startResponse.ok) {
      console.error(
        "Start agent error response:",
        inspect(startResult, { depth: null, colors: true }),
      );
      throw new Error(`Start failed with status: ${startResponse.status}`);
    }

    console.log("✓ Agent started!");
    console.log("Response:", inspect(startResult, { depth: null, colors: true }));

    if (!startResult.success) {
      console.error(
        "Start agent failed - response:",
        inspect(startResult, { depth: null, colors: true }),
      );
      throw new Error("Agent start failed");
    }

    // 4. Get agent info after starting
    console.log("\n4. Getting agent info (after start)...");
    const infoAfterResponse = await fetch(`${baseURL}/agent/info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agentId: createResult.agentId,
        sessionToken: createResult.sessionToken,
      }),
    });

    const infoAfterText = await infoAfterResponse.text();
    // biome-ignore lint/suspicious/noExplicitAny: not needed
    let infoAfter: any;
    try {
      infoAfter = JSON.parse(infoAfterText);
    } catch {
      infoAfter = infoAfterText;
    }

    if (!infoAfterResponse.ok) {
      console.error(
        "Agent info (after) error response:",
        inspect(infoAfter, { depth: null, colors: true }),
      );
      throw new Error(`Agent info (after) failed with status: ${infoAfterResponse.status}`);
    }
    console.log("✓ Agent info retrieved (after start)!");
    console.log("Response:", inspect(infoAfter, { depth: null, colors: true }));

    console.log("\n✅ All tests passed!");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Run the test
testAgentAPI();
