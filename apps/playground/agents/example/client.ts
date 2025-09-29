import { defaults, defineAgentClient } from "life/client";
import { testPluginClient } from "./plugins/test/client";
import type exampleAgent from "./server";

export default defineAgentClient<typeof exampleAgent>("example")
  .plugins([...defaults.plugins, testPluginClient])
  .test({ connectors: ["connector1", "connector5"] });
