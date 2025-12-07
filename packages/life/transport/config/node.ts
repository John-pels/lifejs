import { zodUnionWithTelemetry } from "@/telemetry/helpers/zod";
import { livekitNodeConfig } from "../providers/livekit/node";

export const transportNodeConfig = zodUnionWithTelemetry("provider", [livekitNodeConfig]);
