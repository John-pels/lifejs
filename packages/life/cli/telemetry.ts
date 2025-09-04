import { lifeTelemetry } from "@/telemetry/client";

export const cliTelemetry = lifeTelemetry.child("cli");
