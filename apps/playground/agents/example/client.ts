import { defaults, defineAgentClient } from "life/client";
import { clientOnlyPluginClient } from "./plugins/client-only/client";
import { testPluginClient } from "./plugins/test/client";
import type exampleAgent from "./server";

export default defineAgentClient<typeof exampleAgent>("example")
  .plugins([...defaults.plugins, clientOnlyPluginClient, testPluginClient])
  .memories({
    items: ["item1", "item2"],
  })
  .test({
    connectors: ["connector1", "connector5"],
  })
  .clientOnly({ options: ["option1", "option2"] });
