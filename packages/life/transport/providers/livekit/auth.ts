import { AccessToken } from "livekit-server-sdk";
import * as op from "@/shared/operation";
import type { GetTokenFunction } from "@/transport/auth";

export const getToken: GetTokenFunction<"livekit"> = async (config, roomName, participantId) => {
  try {
    // Create a token with the room name and participant name
    const token = new AccessToken(config.apiKey, config.apiSecret, {
      identity: participantId,
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomCreate: true,
    });

    return op.success(await token.toJwt());
  } catch (error) {
    return op.failure({ code: "Unknown", cause: error });
  }
};
