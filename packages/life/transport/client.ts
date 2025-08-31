import type { z } from "zod";
import { TransportCommon } from "./common";
import type { transportConfig } from "./config";
import type { BaseClientTransportProvider } from "./providers/base/client";
import { LiveKitClientTransportProvider } from "./providers/livekit/client";

// Providers
export const clientTransportProviders = {
  livekit: LiveKitClientTransportProvider,
} as const;

// Transport
export class TransportClient extends TransportCommon {
  _provider: BaseClientTransportProvider<z.AnyZodObject>;

  constructor(config: z.output<typeof transportConfig.clientSchema>) {
    super();
    const ProviderClass = clientTransportProviders[config.provider];
    this._provider = new ProviderClass(config);
  }

  // Proxy base methods from the provider for simpler usage
  on: BaseClientTransportProvider<z.AnyZodObject>["on"] = (...args) => this._provider.on(...args);
  joinRoom: BaseClientTransportProvider<z.AnyZodObject>["joinRoom"] = (...args) =>
    this._provider.joinRoom(...args);
  leaveRoom: BaseClientTransportProvider<z.AnyZodObject>["leaveRoom"] = (...args) =>
    this._provider.leaveRoom(...args);
  streamText: BaseClientTransportProvider<z.AnyZodObject>["streamText"] = (...args) =>
    this._provider.streamText(...args);
  receiveStreamText: BaseClientTransportProvider<z.AnyZodObject>["receiveStreamText"] = (...args) =>
    this._provider.receiveStreamText(...args);
  enableMicrophone: BaseClientTransportProvider<z.AnyZodObject>["enableMicrophone"] = (...args) =>
    this._provider.enableMicrophone(...args);
  playAudio: BaseClientTransportProvider<z.AnyZodObject>["playAudio"] = (...args) =>
    this._provider.playAudio(...args);
}
