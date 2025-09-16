import { defaults, definePluginClient } from "life/client";
import z from "zod";
import type { testPlugin } from "./server";

export const testPluginClient = definePluginClient<typeof testPlugin>("test")
  .dependencies([defaults.plugins.generation])
  .config({
    schema: z.object({
      refreshRate: z.number().default(1000),
      connectors: z.array(z.string()),
    }),
    toTelemetryAttribute: (data) => data,
  })
  .class(
    // biome-ignore lint/correctness/noUnusedFunctionParameters: used in types
    ($Types, Base) =>
      <
        ServerConfig extends (typeof $Types)["ServerConfig"],
        ClientConfig extends (typeof $Types)["ClientConfig"],
      >() =>
        class Client extends Base {
          getItem(name: ServerConfig["items"][number]) {
            this._definition.$serverDef.dependencies;
            return name;
          }
          getConnector(name: ClientConfig["connectors"][number]) {
            return name;
          }
          test() {
            this.server.events.on("event1", (event) => {
              event.type === "event1";
              // @ts-expect-error
              event.type === "event2";
            });
          }
        },
  )
  .atoms(() => {
    return {};
  });
