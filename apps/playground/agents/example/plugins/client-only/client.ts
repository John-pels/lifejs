import { definePluginClient } from "life/client";
import z from "zod";

export const clientOnlyPluginClient = definePluginClient("client-only")
  .config({
    schema: z.object({
      options: z.array(z.string()),
    }),
  })
  .class(
    ({ plugin }) =>
      class {
        getOption(name: (typeof plugin.$types)["clientConfig"]) {
          return name;
        }
      },
    // (_$Types, Base) =>
    //   <
    //     _ServerConfig extends (typeof _$Types)["ServerConfig"],
    //     ClientConfig extends (typeof _$Types)["ClientConfig"],
    //   >() =>
    //     class Client extends Base {
    //       getOption(name: ClientConfig["options"][number]) {
    //         return name;
    //       }
    //     },
  );
