import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import type { LifeServerApi } from "..";
import { createServerAgentsRoute } from "./agents";
import { createServerInfoRoute } from "./info";
import { createServerPingRoute } from "./ping";

export const createServerRoute = (api: LifeServerApi) => {
  const app = new Hono();
  app.use("*", bearerAuth({ token: api.server.options.token }));
  app.route("/", createServerAgentsRoute(api));
  app.route("/", createServerInfoRoute(api));
  app.route("/", createServerPingRoute(api));
  return app;
};
