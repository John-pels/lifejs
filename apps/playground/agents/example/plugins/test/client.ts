import { defaults, definePluginClient } from "life/client";
import z from "zod";
import type { testPlugin } from "./server";

export const testPluginClient = definePluginClient<typeof testPlugin>("test")
  .dependencies([defaults.plugins.generation])
  .config(
    z.object({
      refreshRate: z.number().default(1000),
      connectors: z.array(z.string()),
    }),
  )
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
            this.events.on("event1", (event) => {
              event.type === "event1";
              // @ts-expect-error
              event.type === "event2";
            });
          }
        },
  )
  .atoms(({ client }) => {
    client.methods.test();
    return {};
  });

/*
    .atoms(({ context }) => {
    // Context atoms
    const contextAtoms = () => {
      const data = atom<Awaited<ReturnType<typeof context.get>> | null>(null);
      const status = atom<"idle" | "loading" | "ready" | "error">("idle");
      const error = atom<unknown | null>(null);
      const theme = computed(data, (c) => c?.theme ?? "light"); // derived atom

      // data fetching
      let promise: Promise<void> | null = null;
      const refresh = async () => {
        if (promise) return promise;
        status.set("loading");
        error.set(null);
        promise = (async () => {
          try {
            const next = await context.get();
            data.set(next);
            status.set("ready");
          } catch (e) {
            error.set(e);
            status.set("error");
          } finally {
            promise = null;
          }
        })();
        return promise;
      };

      // reactivity
      onMount(data, () => {
        // initial fetch
        void refresh();

        // subscribe to server-pushed/SDK updates
        const off = context.onChange((next) => {
          data.set(next);
          status.set("ready");
        });

        // cleanup
        return () => {
          off?.();
        };
      });

      return { data, status, error, theme };
    };

    return { context: contextAtoms() };
  });
  */
//
