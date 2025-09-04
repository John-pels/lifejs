import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import z from "zod";
import type { LifeServerApi } from "..";

const dataSchema = z.object({
  agentName: z.string(),
  scope: z.object({}),
});

/**
 * POST /agent/create
 */
export const createAgentCreateRoute = (api: LifeServerApi) => {
  const app = new Hono();
  app.post("/create", zValidator("json", dataSchema), async (c) => {
    const { agentName, scope } = c.req.valid("json");
    const result = await api.server.createAgentProcess({
      name: agentName,
      scope,
      request: c.req.raw,
    });
    return c.json(result, result.success ? 200 : 500);
  });
  return app;
};
