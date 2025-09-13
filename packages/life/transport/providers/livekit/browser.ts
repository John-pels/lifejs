import { type RemoteTrack, Room, RoomEvent } from "livekit-client";
import z from "zod";
import { createConfig } from "@/shared/config";
import * as op from "@/shared/operation";
import { type TransportEvent, TransportProviderClientBase } from "../base";

// Config
export const livekitBrowserConfig = createConfig({
  schema: z.object({
    provider: z.literal("livekit"),
    serverUrl: z
      .string()
      .url()
      .default(process.env.LIVEKIT_SERVER_URL ?? "ws://localhost:7880"),
  }),
  toTelemetryAttribute: (config) => {
    // Remember if the server is a dev server
    config.isDevServer = Boolean(config.serverUrl?.includes("localhost"));

    // Redact sensitive fields
    config.serverUrl = "redacted" as never;

    return config;
  },
});

// Client
export class LiveKitBrowserClient extends TransportProviderClientBase<
  typeof livekitBrowserConfig.schema
> {
  isConnected = false;
  room: Room | null = null;
  listeners: Partial<Record<TransportEvent["type"], ((event: TransportEvent) => void)[]>> = {};

  constructor(config: z.input<typeof livekitBrowserConfig.schema>) {
    super(livekitBrowserConfig.schema, config);
  }

  ensureConnected(name: string, connector: LiveKitBrowserClient) {
    if (!(this.isConnected && this.room?.localParticipant))
      return op.failure({
        code: "Conflict",
        message: `Calling this code (${name}) requires a connected room. Call joinRoom() first.`,
      });
    return op.success(
      connector as LiveKitBrowserClient & {
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
      // TODO: Implement
    });
  }

  async joinRoom(roomName: string, token: string) {
    try {
      // If we are already connected to this room, do nothing
      if (roomName === this.room?.name) return op.success();
      // If we are already connected to a room, leave it before
      if (this.isConnected) {
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

      // Initialize listeners
      this.#initializeListeners(this.room);

      // Connect to the room and auto-subscribe to tracks
      await this.room.connect(this.config.serverUrl, token, { autoSubscribe: true });
      this.isConnected = true;

      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  async leaveRoom() {
    try {
      const [errEnsure, connector] = this.ensureConnected("leaveRoom", this);
      if (errEnsure) return op.failure(errEnsure);
      await connector.room.disconnect();
      this.isConnected = false;
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  async streamText(topic: string) {
    try {
      const [errEnsure, connector] = this.ensureConnected("streamText", this);
      if (errEnsure) return op.failure(errEnsure);
      return op.success(await connector.room.localParticipant.streamText({ topic }));
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  receiveStreamText(
    topic: string,
    callback: (iterator: AsyncIterable<string>, participantId: string) => void | Promise<void>,
  ) {
    try {
      const [errEnsure, connector] = this.ensureConnected("receiveText", this);
      if (errEnsure) return op.failure(errEnsure);
      connector.room.registerTextStreamHandler(topic, (iterator, participantInfo) => {
        callback(iterator as AsyncIterable<string>, participantInfo.identity);
      });
      return op.success(() => {
        connector.room.unregisterTextStreamHandler(topic);
      });
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  async enableMicrophone() {
    try {
      const [errEnsure, connector] = this.ensureConnected("enableMicrophone", this);
      if (errEnsure) return op.failure(errEnsure);
      await connector.room.localParticipant.setMicrophoneEnabled(true, {
        echoCancellation: true,
        noiseSuppression: false,
        voiceIsolation: false,
      });
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  async playAudio() {
    try {
      const [errEnsure, connector] = this.ensureConnected("playAudio", this);
      if (errEnsure) return op.failure(errEnsure);
      await connector.room.startAudio();
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  async streamAudioChunk(chunk: Int16Array) {
    try {
      await chunk;
      throw new Error(
        "streamAudioChunk() is not available for browser client, use enableMicrophone() instead.",
      );
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  on<EventType extends TransportEvent["type"]>(
    type: EventType,
    callback: (data: Extract<TransportEvent, { type: EventType }>) => void,
  ) {
    try {
      if (!this.room) return op.failure({ code: "Conflict", message: "Room not connected." });
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(callback as (event: TransportEvent) => void);
      return op.success(() => {
        this.listeners[type] = this.listeners[type]?.filter((listener) => listener !== callback);
      });
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }
}
