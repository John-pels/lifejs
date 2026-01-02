import { ConnectionState, type RemoteTrack, Room, RoomEvent } from "livekit-client";
import type z from "zod";
import type { LifeError } from "@/shared/error";
import * as op from "@/shared/operation";
import type { MaybePromise } from "@/shared/types";
import { TransportProviderBase } from "../base";
import { livekitConfigSchema } from "./config";

// Client
export class LiveKitBrowser extends TransportProviderBase<typeof livekitConfigSchema> {
  room: Room | null = null;

  constructor(config: z.input<typeof livekitConfigSchema>) {
    super(livekitConfigSchema, config);
  }

  async joinRoom(roomName: string, token: string) {
    try {
      // If we are already connected to this room, do nothing
      if (roomName === this.room?.name) return op.success();
      // If we are already connected to a room, leave it before
      const isConnected = this.room?.state === ConnectionState.Connected;
      if (isConnected) {
        const [errLeave] = await this.leaveRoom();
        if (errLeave) return op.failure(errLeave);
      }

      // Create the room and set up event listeners
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
        disconnectOnPageLeave: true,
        publishDefaults: {
          dtx: true,
          red: true,
        },
      });
      this.room.on(RoomEvent.TrackSubscribed, (track) => {
        const element = track.attach();
        document.body.appendChild(element);
      });
      this.room.on("connected", () => this.emit({ type: "connected" }));
      this.room.on("disconnected", () => this.emit({ type: "disconnected" }));

      // Initialize listeners
      this.#initializeListeners(this.room);

      // Connect to the room and auto-subscribe to tracks
      await this.room.connect(this.config.serverUrl, token, { autoSubscribe: true });

      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  async leaveRoom() {
    try {
      const [errEnsure, connector] = this.#ensureConnected("leaveRoom");
      if (errEnsure) return op.failure(errEnsure);
      await connector.room.disconnect();
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  async streamText(topic: string) {
    try {
      const [errEnsure, connector] = this.#ensureConnected("streamText");
      if (errEnsure) return op.failure(errEnsure);
      return op.success(await connector.room.localParticipant.streamText({ topic }));
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  receiveStreamText(
    topic: string,
    callback: (iterator: AsyncIterable<string>, participantId: string) => MaybePromise<void>,
    onError?: (error: LifeError) => void,
  ) {
    try {
      const [errEnsure, connector] = this.#ensureConnected("receiveText");
      if (errEnsure) return op.failure(errEnsure);
      connector.room.registerTextStreamHandler(topic, async (iterator, participantInfo) => {
        const [err] = await op.attempt(async () => {
          await callback(iterator, participantInfo.identity);
        });
        if (err) onError?.(err);
      });
      return op.success(() => {
        connector.room.unregisterTextStreamHandler(topic);
      });
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  async enableMicrophone() {
    try {
      const [errEnsure, connector] = this.#ensureConnected("enableMicrophone");
      if (errEnsure) return op.failure(errEnsure);
      await connector.room.localParticipant.setMicrophoneEnabled(true, {
        echoCancellation: true,
        noiseSuppression: false,
        voiceIsolation: false,
      });
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  async playAudio() {
    try {
      const [errEnsure, connector] = this.#ensureConnected("playAudio");
      if (errEnsure) return op.failure(errEnsure);
      await connector.room.startAudio();
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  async streamAudioChunk(chunk: Int16Array) {
    try {
      await chunk;
      throw new Error(
        "streamAudioChunk() is not available for browser client, use enableMicrophone() instead.",
      );
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  #ensureConnected(name: string) {
    const isConnected = this.room?.state === ConnectionState.Connected;
    if (!isConnected)
      return op.failure({
        code: "Conflict",
        message: `Calling '${name}' requires a connected room. Call joinRoom() first.`,
      });
    return op.success(
      this as LiveKitBrowser & {
        room: Room & { localParticipant: NonNullable<Room["localParticipant"]> };
      },
    );
  }

  #initializeListeners(room: Room) {
    // audio-chunk
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind !== "audio") return;

      // Listen for unsubscribing
      let _isUnsubscribed = false;
      const unsubscribeHandler = (unsubscribedTrack: RemoteTrack) => {
        if (unsubscribedTrack.sid === track.sid) _isUnsubscribed = true;
        room.off(RoomEvent.TrackUnsubscribed, unsubscribeHandler);
      };
      room.on(RoomEvent.TrackUnsubscribed, unsubscribeHandler);

      // Stream audio chunks until the track is unsubscribed
      // -> Not supported in browser client yet.
    });
  }
}
