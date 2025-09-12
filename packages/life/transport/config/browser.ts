import { createConfigUnion } from "@/shared/config";
import { livekitBrowserConfig } from "../providers/livekit/browser";

export const transportBrowserConfig = createConfigUnion("provider", [livekitBrowserConfig]);
