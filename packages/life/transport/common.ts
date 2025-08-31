import { canon, type SerializableValue } from "@/shared/canon";
import { TransportRPC } from "./rpc";

// Agnostic logioc between client and server transport classes
export abstract class TransportCommon extends TransportRPC {
  async sendText(topic: string, text: string) {
    const writer = await this.streamText(topic);
    await writer.write(text);
    await writer.close();
  }

  receiveText(topic: string, callback: (text: string, participantId: string) => void) {
    this.receiveStreamText(
      topic,
      async (iterator: AsyncIterable<string>, participantId: string) => {
        let result = "";
        for await (const chunk of iterator) {
          result += chunk;
        }
        callback(result, participantId);
      },
    );
  }

  sendObject(topic: string, obj: SerializableValue) {
    const serialized = canon.stringify(obj);
    return this.sendText(topic, serialized);
  }

  receiveObject(topic: string, callback: (obj: unknown, participantId: string) => void) {
    this.receiveText(topic, (text, participantId) => {
      const deserialized = canon.parse(text);
      callback(deserialized, participantId);
    });
  }

  // Abstract methods
  abstract streamText(
    topic: string,
  ): Promise<
    Omit<
      WritableStreamDefaultWriter<string>,
      "desiredSize" | "closed" | "ready" | "abort" | "releaseLock"
    >
  >;
  abstract receiveStreamText(
    topic: string,
    callback: (iterator: AsyncIterable<string>, participantId: string) => void | Promise<void>,
  ): void;
}
