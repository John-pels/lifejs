import { Hono } from "hono";
import type { LifeServerApi } from "..";

/**
 * GET /server/agents
 */
export const createServerAgentsRoute = (api: LifeServerApi) => {
  const app = new Hono();
  app.get("/agents", (c) => {
    const result = api.server.listAgentProcesses();
    return c.json(result, result.success ? 200 : 500);
  });
  return app;
};
