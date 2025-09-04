import { serve } from "@hono/node-server";
import chalk from "chalk";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { timeout } from "hono/timeout";
import { ns } from "@/shared/nanoseconds";
import { newId } from "@/shared/prefixed-id";
import type { Telemetry } from "@/telemetry/client";
import type { LifeServer } from "..";
import { createAgentRoute } from "./agent";
import { createServerRoute } from "./server";

export class LifeServerApi {
  app = new Hono();
  server: LifeServer;
  telemetry: Telemetry;
  #honoServer: ReturnType<typeof serve> | null = null;

  constructor(server: LifeServer) {
    this.server = server;
    this.telemetry = server.telemetry.child("api");

    // Telemetry
    this.app.use(async (c, next) => {
      const requestId = newId("request");
      using h0 = (
        await this.telemetry.trace(`${c.req.method} ${c.req.path}`, {
          method: c.req.method,
          path: c.req.path,
          requestId,
        })
      ).start();
      c.header("Life-Request-Id", requestId);
      try {
        await next();
      } catch (error) {
        h0.log.error({ message: `Uncaught error in route: ${c.req.method} ${c.req.path}`, error });
      }
      h0.end();
      let statusChalk = chalk.gray;
      if (c.res.status >= 500) statusChalk = chalk.red;
      else if (c.res.status >= 400) statusChalk = chalk.yellow;
      else if (c.res.status >= 300) statusChalk = chalk.cyan;
      else if (c.res.status >= 200) statusChalk = chalk.green;
      this.telemetry.log.info({
        message: `(${statusChalk.bold(c.res.status.toString())}) ${c.req.method} ${c.req.path} [in ${chalk.bold(`${ns.toMs(h0.getSpan().duration)}ms]`)}`,
      });
    });

    // CORS
    this.app.use(
      "*",
      cors({
        credentials: true,
        origin: "*",
      }),
    );

    // Body limit (50kb)
    this.app.use(
      "*",
      bodyLimit({
        maxSize: 50 * 1024, // 50kb
        onError: (c) => c.text("overflow :(", 413),
      }),
    );

    // Timeout (10s)
    this.app.use("*", timeout(10_000));

    // Setup API endpoints
    this.app.get("/", (c) => c.json({ message: "Hello, world!" }));
    this.app.route("/agent", createAgentRoute(this));
    this.app.route("/server", createServerRoute(this));
  }

  async start() {
    using h0 = (await this.telemetry.trace("start()")).start();
    h0.log.info({
      message: `Starting API server on http://${this.server.options.host}:${this.server.options.port}`,
    });
    this.#honoServer = serve({
      fetch: this.app.fetch,
      port: Number.parseInt(this.server.options.port, 10),
      hostname: this.server.options.host,
    });
  }

  async stop() {
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.telemetry.log.error({
          message: "API server took longer than 10 seconds to close (timeout).",
        });
        reject(new Error("API server took longer than 10 seconds to close (timeout)."));
      }, 10_000);
      if (!this.#honoServer) return resolve();
      this.#honoServer.close((err) => {
        clearTimeout(timeoutId);
        if (err) reject(err);
        else resolve();
      });
    });
    this.#honoServer = null;
  }
}
