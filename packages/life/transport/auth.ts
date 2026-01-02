import type { TransportGetJoinRoomArgsFunction } from "@/transport/types";
import { getJoinRoomArgs } from "./providers/livekit/auth";

export const transportGetJoinRoomArgs: Record<string, TransportGetJoinRoomArgsFunction> = {
  livekit: getJoinRoomArgs,
};
