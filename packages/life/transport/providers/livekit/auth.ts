import { AccessToken } from "livekit-server-sdk";
import * as op from "@/shared/operation";
import type { TransportGetJoinRoomArgsFunction } from "@/transport/types";

export const getJoinRoomArgs: TransportGetJoinRoomArgsFunction = async (roomId, participantId) => {
  try {
    // Create a token with the room name and participant name
    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY ?? "devkey",
      process.env.LIVEKIT_API_SECRET ?? "secret",
      { identity: participantId },
    );

    // Grant permissions to the token
    token.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomCreate: true,
    });

    // Get the token as a JWT
    const tokenJwt = await token.toJwt();

    // Return the token and room ID
    return op.success([roomId, tokenJwt]);
  } catch (error) {
    return op.failure({ code: "Unknown", cause: error });
  }
};
