import { Hono } from "hono";
import type { LifeServerApi } from "..";
import { createAgentCreateRoute } from "./create";
import { createAgentInfoRoute } from "./info";
import { createAgentStartRoute } from "./start";
import { createAgentStopRoute } from "./stop";

export const createAgentRoute = (api: LifeServerApi) => {
  const app = new Hono();
  app.route("/", createAgentInfoRoute(api));
  app.route("/", createAgentStartRoute(api));
  app.route("/", createAgentStopRoute(api));
  app.route("/", createAgentCreateRoute(api));
  return app;
};
