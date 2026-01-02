import z from "zod";
import type { LifeError } from "@/shared/error";
import * as op from "@/shared/operation";
import { TransportProviderBase } from "../providers/base";
import { TransportClientBase } from "./base";

const mockConfigSchema = z.object({});

type StreamCallback = (
  iterator: AsyncIterable<string>,
  participantId: string,
) => void | Promise<void>;

/** Internal mock provider - not exported */
class MockProvider extends TransportProviderBase<typeof mockConfigSchema> {
  readonly id: string;
  readonly peers: MockProvider[] = [];
  readonly streams = new Map<string, StreamCallback[]>();

  constructor(id: string) {
    super(mockConfigSchema, {});
    this.id = id;
  }

  joinRoom() {
    return Promise.resolve(op.success());
  }

  leaveRoom() {
    return Promise.resolve(op.success());
  }

  streamText(
    topic: string,
  ): Promise<
    op.OperationResult<{ write: (chunk: string) => Promise<void>; close: () => Promise<void> }>
  > {
    const chunks: string[] = [];
    const { peers, id } = this;

    return Promise.resolve(
      op.success({
        write: (chunk: string) => {
          chunks.push(chunk);
          return Promise.resolve();
        },
        close: async () => {
          for (const peer of peers) {
            const callbacks = peer.streams.get(topic) ?? [];
            for (const cb of callbacks) {
              await cb(toAsyncIterable(chunks), id);
            }
          }
        },
      }),
    );
  }

  receiveStreamText(
    topic: string,
    callback: StreamCallback,
    _onError?: (error: LifeError) => void,
  ): op.OperationResult<() => void> {
    const callbacks = this.streams.get(topic) ?? [];
    callbacks.push(callback);
    this.streams.set(topic, callbacks);

    return op.success(() => {
      const cbs = this.streams.get(topic) ?? [];
      this.streams.set(
        topic,
        cbs.filter((cb) => cb !== callback),
      );
    });
  }

  enableMicrophone(): Promise<op.OperationResult<void>> {
    return Promise.resolve(op.success());
  }

  playAudio(): Promise<op.OperationResult<void>> {
    return Promise.resolve(op.success());
  }

  streamAudioChunk(chunk: Int16Array): Promise<op.OperationResult<void>> {
    for (const peer of this.peers) peer.emit({ type: "audio", chunk });
    return Promise.resolve(op.success());
  }
}

function toAsyncIterable(chunks: string[]): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield await Promise.resolve(chunk);
      }
    },
  };
}

/**
 * Mock transport client for testing.
 *
 * @example
 * ```ts
 * const clientA = new MockTransportClient("a");
 * const clientB = new MockTransportClient("b");
 * clientA.addPeer(clientB);
 * clientB.addPeer(clientA);
 *
 * await clientA.joinRoom();
 * await clientB.joinRoom();
 *
 * clientB.receiveText("topic", (text) => console.log(text));
 * await clientA.sendText("topic", "Hello!");
 * ```
 */
export class MockTransportClient extends TransportClientBase {
  readonly #provider: MockProvider;

  constructor(id: string) {
    const provider = new MockProvider(id);
    super({ provider, obfuscateErrors: false });
    this.#provider = provider;
  }

  /** Add a peer that will receive messages sent by this client */
  addPeer(other: MockTransportClient): void {
    this.#provider.peers.push(other.#provider);
  }
}
