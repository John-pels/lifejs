import { type RemoteTrack, type Room as RoomType, TrackKind } from "@livekit/rtc-node";
import z from "zod";
import { createConfig } from "@/shared/config";
import * as op from "@/shared/operation";
import type { MaybePromise } from "@/shared/types";
import { type TransportEvent, TransportProviderClientBase } from "../base";

// Config
export const livekitNodeConfig = createConfig({
  schema: z.object({
    provider: z.literal("livekit"),
    serverUrl: z
      .string()
      .url()
      .default(process.env.LIVEKIT_SERVER_URL ?? "ws://localhost:7880"),
    apiKey: z.string().default(process.env.LIVEKIT_API_KEY ?? "devkey"),
    apiSecret: z.string().default(process.env.LIVEKIT_API_SECRET ?? "secret"),
  }),
  toTelemetryAttribute: (config) => {
    // Remember if the server is a dev server
    config.isDevServer = Boolean(config.serverUrl?.includes("localhost"));

    // Redact sensitive fields
    config.serverUrl = "redacted" as never;
    config.apiKey = "redacted" as never;
    config.apiSecret = "redacted" as never;

    return config;
  },
});

// Client
export class LiveKitNodeClient extends TransportProviderClientBase<
  typeof livekitNodeConfig.schema
> {
  lk = LiveKitNodeClient.loadLiveKitRTCNode();
  isConnected = false;
  room: RoomType | null = null;
  listeners: Partial<Record<TransportEvent["type"], ((event: TransportEvent) => void)[]>> = {};
  source = new this.lk.AudioSource(16_000, 1, 1_000_000);

  private audioBuffer: Int16Array = new Int16Array(0);
  private readonly FRAME_DURATION_MS = 10; // 10ms frames
  private readonly SAMPLES_PER_FRAME = (16_000 * this.FRAME_DURATION_MS) / 1000; // 160 samples for 10ms at 16kHz

  #flushTimeout: NodeJS.Timeout | null = null;

  constructor(config: z.input<typeof livekitNodeConfig.schema>) {
    super(livekitNodeConfig.schema, config);
  }

  static loadLiveKitRTCNode() {
    // Import LiveKit RTC Node in production mode to avoid DEBUG-level logs
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const lk = require("@livekit/rtc-node") as typeof import("@livekit/rtc-node");
    process.env.NODE_ENV = prev;
    return lk;
  }

  ensureConnected(name: string, connector: LiveKitNodeClient) {
    if (!(this.isConnected && this.room?.localParticipant))
      return op.failure({
        code: "Conflict",
        message: `Calling this code (${name}) requires a connected room. Call joinRoom() first.`,
      });
    return op.success(
      connector as LiveKitNodeClient & {
        room: RoomType & { localParticipant: NonNullable<RoomType["localParticipant"]> };
      },
    );
  }

  #initializeListeners(room: RoomType) {
    // audio-chunk
    room.on(this.lk.RoomEvent.TrackSubscribed, async (track) => {
      if (track.kind !== TrackKind.KIND_AUDIO) return;

      // Listen for unsubscribing
      let isUnsubscribed = false;
      const unsubscribeHandler = (unsubscribedTrack: RemoteTrack) => {
        if (unsubscribedTrack.sid === track.sid) isUnsubscribed = true;
        room.off(this.lk.RoomEvent.TrackUnsubscribed, unsubscribeHandler);
      };
      room.on(this.lk.RoomEvent.TrackUnsubscribed, unsubscribeHandler);

      // Stream audio chunks until the track is unsubscribed
      const audio = new this.lk.AudioStream(track, { sampleRate: 16_000 });
      // @ts-expect-error - AudioStream extends ReadableStream which has Symbol.asyncIterator at runtime
      for await (const frame of audio) {
        if (isUnsubscribed) break;
        for (const listener of this.listeners["audio-chunk"] ?? []) {
          listener({ type: "audio-chunk", chunk: frame.data });
        }
      }
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
      this.room = new this.lk.Room();

      // Initialize listeners
      this.#initializeListeners(this.room);

      // Connect to the room and auto-subscribe to tracks
      await this.room.connect(this.config.serverUrl, token, {
        autoSubscribe: true,
        dynacast: true,
      });
      this.isConnected = true;

      // Publish the track
      const track = this.lk.LocalAudioTrack.createAudioTrack("audio", this.source);
      const options = new this.lk.TrackPublishOptions();
      options.source = this.lk.TrackSource.SOURCE_MICROPHONE;
      await this.room.localParticipant?.publishTrack(track, options);

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
      await this.lk.dispose();
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
    callback: (iterator: AsyncIterable<string>, participantId: string) => MaybePromise<void>,
  ) {
    try {
      const [errEnsure, connector] = this.ensureConnected("receiveText", this);
      if (errEnsure) return op.failure(errEnsure);
      connector.room.registerTextStreamHandler(topic, (iterator, participantInfo) => {
        callback(iterator as unknown as AsyncIterable<string>, participantInfo.identity);
      });
      return op.success(() => {
        connector.room.unregisterTextStreamHandler(topic);
      });
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

  async flushAudioBuffer() {
    try {
      if (!this.audioBuffer?.length) return;
      const audioFrame = new this.lk.AudioFrame(
        this.audioBuffer,
        16_000,
        1,
        this.audioBuffer.length,
      );
      try {
        await this.source.captureFrame(audioFrame);
      } catch (error) {
        console.error("Error capturing audio frame:", error);
      }
      this.audioBuffer = new Int16Array(0);
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  async streamAudioChunk(chunk: Int16Array) {
    try {
      const [errEnsure] = this.ensureConnected("streamAudioChunk", this);
      if (errEnsure) return op.failure(errEnsure);

      // Clear any existing flush timeout
      if (this.#flushTimeout) clearTimeout(this.#flushTimeout);

      // Add chunk to buffer
      this.audioBuffer = this.concatenateArrays(this.audioBuffer, chunk);

      // Stream audio frames buffered by FRAME_DURATION_MS chunks
      while (this.audioBuffer.length >= this.SAMPLES_PER_FRAME) {
        const frameData = this.audioBuffer.slice(0, this.SAMPLES_PER_FRAME);
        this.audioBuffer = this.audioBuffer.slice(this.SAMPLES_PER_FRAME);

        const audioFrame = new this.lk.AudioFrame(frameData, 16_000, 1, this.SAMPLES_PER_FRAME);
        // biome-ignore lint/performance/noAwaitInLoops: sequential execution required here
        const [errCapture] = await op.attempt(
          async () => await this.source.captureFrame(audioFrame),
        );
        if (errCapture) return op.failure(errCapture);
      }

      // If some frames remain, flush them after 150ms
      // (this should leave enough time to most TTS providers to output next chunk)
      if (this.audioBuffer.length > 0) {
        this.#flushTimeout = setTimeout(() => this.flushAudioBuffer(), 150);
      }

      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  private concatenateArrays(a: Int16Array, b: Int16Array): Int16Array {
    const result = new Int16Array(a.length + b.length);
    result.set(a, 0);
    result.set(b, a.length);
    return result;
  }

  async enableMicrophone() {
    try {
      throw await new Error(
        "enableMicrophone() is not available for Node.js client, use streamAudioChunk() instead.",
      );
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  async playAudio() {
    try {
      throw await new Error(
        "playAudio() is not available for Node.js client, use on('audio-chunk') instead.",
      );
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }
}
