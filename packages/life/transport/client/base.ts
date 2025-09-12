import type z from "zod";
import { canon, type SerializableValue } from "@/shared/canon";
import * as op from "@/shared/operation";
import type { TransportProviderClientBase } from "../providers/base";
import { TransportRPC } from "./rpc";

// Runtime-agnostic logic between transport classes
export abstract class TransportClientBase extends TransportRPC {
  _provider: TransportProviderClientBase<z.AnyZodObject>;

  constructor(provider: TransportProviderClientBase<z.AnyZodObject>) {
    super();
    this._provider = provider;
  }

  async sendText(topic: string, text: string) {
    try {
      const [errWriter, writer] = await this.streamText(topic);
      if (errWriter) return op.failure(errWriter);
      await writer.write(text);
      await writer.close();
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  receiveText(topic: string, callback: (text: string, participantId: string) => void) {
    try {
      const [errReceive] = this.receiveStreamText(
        topic,
        async (iterator: AsyncIterable<string>, participantId: string) => {
          let result = "";
          for await (const chunk of iterator) {
            result += chunk;
          }
          callback(result, participantId);
        },
      );
      if (errReceive) return op.failure(errReceive);
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  async sendObject(topic: string, obj: SerializableValue) {
    try {
      const [errCanon, serialized] = canon.stringify(obj);
      if (errCanon) return op.failure(errCanon);
      const [errSend] = await this.sendText(topic, serialized);
      if (errSend) return op.failure(errSend);
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  receiveObject(topic: string, callback: (obj: unknown, participantId: string) => void) {
    try {
      this.receiveText(topic, (text, participantId) => {
        const deserialized = canon.parse(text);
        callback(deserialized, participantId);
      });
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  // Proxy base methods from the provider for simpler usage
  on: TransportProviderClientBase<z.AnyZodObject>["on"] = (...args) => this._provider.on(...args);
  joinRoom: TransportProviderClientBase<z.AnyZodObject>["joinRoom"] = (...args) =>
    this._provider.joinRoom(...args);
  leaveRoom: TransportProviderClientBase<z.AnyZodObject>["leaveRoom"] = (...args) =>
    this._provider.leaveRoom(...args);
  streamText: TransportProviderClientBase<z.AnyZodObject>["streamText"] = (...args) =>
    this._provider.streamText(...args);
  receiveStreamText: TransportProviderClientBase<z.AnyZodObject>["receiveStreamText"] = (...args) =>
    this._provider.receiveStreamText(...args);
  enableMicrophone: TransportProviderClientBase<z.AnyZodObject>["enableMicrophone"] = (...args) =>
    this._provider.enableMicrophone(...args);
  playAudio: TransportProviderClientBase<z.AnyZodObject>["playAudio"] = (...args) =>
    this._provider.playAudio(...args);
  streamAudioChunk: TransportProviderClientBase<z.AnyZodObject>["streamAudioChunk"] = (...args) =>
    this._provider.streamAudioChunk(...args);
}
