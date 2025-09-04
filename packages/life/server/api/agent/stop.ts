import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import z from "zod";
import type { LifeServerApi } from "..";

const dataSchema = z.object({
  agentId: z.string(),
  sessionToken: z.string(),
});

/**
 * POST /agent/stop
 */
export const createAgentStopRoute = (api: LifeServerApi) => {
  const app = new Hono();
  app.post("/stop", zValidator("json", dataSchema), async (c) => {
    const { agentId, sessionToken } = c.req.valid("json");
    const result = await api.server.stopAgentProcess(agentId, sessionToken);
    return c.json(result, result.success ? 200 : 500);
  });
  return app;
};
