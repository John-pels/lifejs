import type * as op from "@/shared/operation";
import type { nodeTransportProviders } from "./client/node";
import { getToken } from "./providers/livekit/auth";

export type GetTokenFunction<ProviderId extends keyof typeof nodeTransportProviders> = (
  config: ConstructorParameters<(typeof nodeTransportProviders)[ProviderId]>[0],
  roomName: string,
  participantId: string,
) => Promise<op.OperationResult<string>>;

export const transportProviderGetToken = {
  livekit: getToken,
} as const satisfies Record<
  keyof typeof nodeTransportProviders,
  GetTokenFunction<keyof typeof nodeTransportProviders>
>;
