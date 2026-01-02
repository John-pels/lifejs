import {
  AudioFrame,
  AudioSource,
  AudioStream,
  ConnectionState,
  dispose,
  LocalAudioTrack,
  type RemoteTrack,
  Room,
  RoomEvent,
  type Room as RoomType,
  TrackKind,
  TrackPublishOptions,
  TrackSource,
} from "@livekit/rtc-node";
import type z from "zod";
import type { LifeError } from "@/shared/error";
import * as op from "@/shared/operation";
import type { MaybePromise } from "@/shared/types";
import { TransportProviderBase } from "../base";
import { livekitConfigSchema } from "./config";

const FRAME_DURATION_MS = 10; // 10ms frames
const SAMPLES_PER_FRAME = (16_000 * FRAME_DURATION_MS) / 1000; // 160 samples for 10ms at 16kHz

export class LiveKitNode extends TransportProviderBase<typeof livekitConfigSchema> {
  room: RoomType | null = null;
  #audioBuffer: Int16Array = new Int16Array(0);
  readonly #source = new AudioSource(16_000, 1, 1_000_000);

  #flushTimeout: NodeJS.Timeout | null = null;

  constructor(config: z.input<typeof livekitConfigSchema>) {
    super(livekitConfigSchema, config);
  }

  async joinRoom(roomName: string, token: string) {
    try {
      // If we are already connected to this room, do nothing
      if (roomName === this.room?.name) return op.success();

      // If we are already connected to a room, leave it before
      const isConnected = this.room?.connectionState === ConnectionState.CONN_CONNECTED;
      if (isConnected) {
        const [errLeave] = await this.leaveRoom();
        if (errLeave) return op.failure(errLeave);
      }

      // Create the room and set up event listeners
      this.room = new Room();
      this.room.on("connected", () => this.emit({ type: "connected" }));
      this.room.on("disconnected", () => this.emit({ type: "disconnected" }));

      // Initialize listeners
      this.#initializeListeners(this.room);

      // Connect to the room and auto-subscribe to tracks
      await this.room.connect(this.config.serverUrl, token, {
        autoSubscribe: true,
        dynacast: true,
      });

      // Publish the track
      const track = LocalAudioTrack.createAudioTrack("audio", this.#source);
      const options = new TrackPublishOptions();
      options.source = TrackSource.SOURCE_MICROPHONE;
      await this.room.localParticipant?.publishTrack(track, options);

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
      await dispose();
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
          await callback(iterator as unknown as AsyncIterable<string>, participantInfo.identity);
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

  async flushAudioBuffer() {
    try {
      if (!this.#audioBuffer?.length) return;
      const audioFrame = new AudioFrame(this.#audioBuffer, 16_000, 1, this.#audioBuffer.length);
      try {
        await this.#source.captureFrame(audioFrame);
      } catch (error) {
        console.error("Error capturing audio frame:", error);
      }
      this.#audioBuffer = new Int16Array(0);
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  async streamAudioChunk(chunk: Int16Array) {
    try {
      const [errEnsure] = this.#ensureConnected("streamAudioChunk");
      if (errEnsure) return op.failure(errEnsure);

      // Clear any existing flush timeout
      if (this.#flushTimeout) clearTimeout(this.#flushTimeout);

      // Add chunk to buffer
      this.#audioBuffer = this.concatenateArrays(this.#audioBuffer, chunk);

      // Stream audio frames buffered by FRAME_DURATION_MS chunks
      while (this.#audioBuffer.length >= SAMPLES_PER_FRAME) {
        const frameData = this.#audioBuffer.slice(0, SAMPLES_PER_FRAME);
        this.#audioBuffer = this.#audioBuffer.slice(SAMPLES_PER_FRAME);

        const audioFrame = new AudioFrame(frameData, 16_000, 1, SAMPLES_PER_FRAME);
        const [errCapture] = await op.attempt(
          async () => await this.#source.captureFrame(audioFrame),
        );
        if (errCapture) return op.failure(errCapture);
      }

      // If some frames remain, flush them after 150ms
      // (this should leave enough time to most TTS providers to output next chunk)
      if (this.#audioBuffer.length > 0) {
        this.#flushTimeout = setTimeout(() => this.flushAudioBuffer(), 150);
      }

      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  private concatenateArrays(a: Int16Array, b: Int16Array): Int16Array {
    const result = new Int16Array(a.length + b.length);
    result.set(a, 0);
    result.set(b, a.length);
    return result;
  }

  async enableMicrophone() {
    const message = "Use streamAudioChunk() instead of enableMicrophone() in LiveKit Node.js.";
    return await op.failure({ code: "NotImplemented", message });
  }

  async playAudio() {
    const message = "Use on('audio') instead of playAudio() in LiveKit Node.js.";
    return await op.failure({ code: "NotImplemented", message });
  }

  #ensureConnected(name: string) {
    const isConnected = this.room?.connectionState === ConnectionState.CONN_CONNECTED;
    if (!isConnected)
      return op.failure({
        code: "Conflict",
        message: `Calling '${name}' requires a connected room. Call joinRoom() first.`,
      });
    return op.success(
      this as LiveKitNode & {
        room: RoomType & { localParticipant: NonNullable<RoomType["localParticipant"]> };
      },
    );
  }

  #initializeListeners(room: RoomType) {
    // audio-chunk
    room.on(RoomEvent.TrackSubscribed, async (track) => {
      if (track.kind !== TrackKind.KIND_AUDIO) return;

      // Listen for unsubscribing
      let isUnsubscribed = false;
      const unsubscribeHandler = (unsubscribedTrack: RemoteTrack) => {
        if (unsubscribedTrack.sid === track.sid) isUnsubscribed = true;
        room.off(RoomEvent.TrackUnsubscribed, unsubscribeHandler);
      };
      room.on(RoomEvent.TrackUnsubscribed, unsubscribeHandler);

      // Stream audio chunks until the track is unsubscribed
      const audio = new AudioStream(track, { sampleRate: 16_000 });
      // @ts-expect-error - AudioStream extends ReadableStream which has Symbol.asyncIterator at runtime
      for await (const frame of audio) {
        if (isUnsubscribed) break;
        this.emit({ type: "audio", chunk: frame.data });
      }
    });
  }
}
