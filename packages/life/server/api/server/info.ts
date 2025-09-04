import { Hono } from "hono";
import type { LifeServerApi } from "..";

/**
 * GET /server/info
 */
export const createServerInfoRoute = (api: LifeServerApi) => {
  const app = new Hono();
  app.get("/info", async (c) => {
    const result = await api.server.getServerInfo();
    return c.json(result, result.success ? 200 : 500);
  });
  return app;
};
