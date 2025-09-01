import { createLifeClient } from "life/client";

export const life = createLifeClient({
  serverUrl: "ws://localhost:3003",
});
