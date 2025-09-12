import { createConfigUnion } from "@/shared/config";
import { livekitNodeConfig } from "../providers/livekit/node";

export const transportNodeConfig = createConfigUnion("provider", [livekitNodeConfig]);
