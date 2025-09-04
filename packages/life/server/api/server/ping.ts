import { Hono } from "hono";
import type { LifeServerApi } from "..";

/**
 * GET /server/ping
 */
export const createServerPingRoute = (_api: LifeServerApi) => {
  const app = new Hono();
  app.get("/ping", (c) => {
    return c.text("pong");
  });
  return app;
};
