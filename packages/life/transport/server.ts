import { ensureServer } from "@/shared/ensure-server";

ensureServer("transport.server");

import type { z } from "zod";
import { TransportCommon } from "./common";
import type { transportConfig } from "./config";
import type { BaseServerTransportProvider } from "./providers/base/server";
import { LiveKitServerTransport } from "./providers/livekit/server";

// Providers
export const serverTransportProviders = {
  livekit: LiveKitServerTransport,
} as const;

// Transport
export class TransportServer extends TransportCommon {
  _provider: BaseServerTransportProvider<z.AnyZodObject>;

  constructor(config: z.output<typeof transportConfig.serverSchema>) {
    super();
    const ProviderClass = serverTransportProviders[config.provider];
    this._provider = new ProviderClass(config);
  }

  // Proxy base methods from the provider for simpler usage
  on: BaseServerTransportProvider<z.AnyZodObject>["on"] = (...args) => this._provider.on(...args);
  joinRoom: BaseServerTransportProvider<z.AnyZodObject>["joinRoom"] = (...args) =>
    this._provider.joinRoom(...args);
  leaveRoom: BaseServerTransportProvider<z.AnyZodObject>["leaveRoom"] = (...args) =>
    this._provider.leaveRoom(...args);
  streamText: BaseServerTransportProvider<z.AnyZodObject>["streamText"] = (...args) =>
    this._provider.streamText(...args);
  receiveStreamText: BaseServerTransportProvider<z.AnyZodObject>["receiveStreamText"] = (...args) =>
    this._provider.receiveStreamText(...args);
  streamAudioChunk: BaseServerTransportProvider<z.AnyZodObject>["streamAudioChunk"] = (...args) =>
    this._provider.streamAudioChunk(...args);
}
