import type { serverTransportProviders } from "./server.js";

export type GetTokenFunction<ProviderId extends keyof typeof serverTransportProviders> = (
  config: ConstructorParameters<(typeof serverTransportProviders)[ProviderId]>[0],
  roomName: string,
  participantId: string,
) => Promise<string>;

export const getToken = async <ProviderId extends keyof typeof serverTransportProviders>(
  provider: ProviderId,
  config: ConstructorParameters<(typeof serverTransportProviders)[ProviderId]>[0],
  roomName: string,
  participantId: string,
) => {
  let getTokenFunction: GetTokenFunction<ProviderId>;
  if (provider === "livekit")
    getTokenFunction = (await import("./providers/livekit/auth.js")).getToken;
  // else if (provider === "daily")
  //   getTokenFunction = (await import("./providers/daily/auth.js")).getToken;
  else throw new Error(`Invalid transport provider: ${config.provider}`);
  return getTokenFunction(config, roomName, participantId);
};
