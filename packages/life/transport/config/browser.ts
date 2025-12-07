import { zodUnionWithTelemetry } from "@/telemetry/helpers/zod";
import { livekitBrowserConfig } from "../providers/livekit/browser";

export const transportBrowserConfig = zodUnionWithTelemetry("provider", [livekitBrowserConfig]);
