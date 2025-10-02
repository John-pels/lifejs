import type z from "zod";
import { canon, type SerializableValue } from "@/shared/canon";
import * as op from "@/shared/operation";
import { newId } from "@/shared/prefixed-id";
import type { MaybePromise } from "@/shared/types";
import type { TransportProviderClientBase } from "./providers/base";
import {
  type RPCProcedure,
  type RPCProcedureSchema,
  type RPCRequest,
  type RPCResponse,
  rpcMessageSchema,
} from "./types";

// Runtime-agnostic logic between transport classes
export abstract class TransportClientBase {
  readonly #provider: TransportProviderClientBase<z.ZodObject>;
  readonly #filterPublic: boolean;
  readonly #procedures = new Map<string, RPCProcedure>();
  readonly #resolveResults = new Map<
    string,
    (value?: op.OperationResult<SerializableValue>) => MaybePromise<void>
  >();
  #rpcUnsubscribe?: () => void;

  constructor({
    provider,
    filterPublic = false,
  }: { provider: TransportProviderClientBase<z.ZodObject>; filterPublic?: boolean }) {
    this.#provider = provider;
    this.#filterPublic = filterPublic;
  }

  async sendText(topic: string, text: string) {
    try {
      const [errWriter, writer] = await this.streamText(topic);
      if (errWriter) return op.failure(errWriter);
      await writer.write(text);
      await writer.close();
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  receiveText(
    topic: string,
    callback: (text: string, participantId: string) => MaybePromise<void>,
  ) {
    try {
      const [errReceive, unsubscribe] = this.receiveStreamText(
        topic,
        async (iterator: AsyncIterable<string>, participantId: string) => {
          let result = "";
          for await (const chunk of iterator) {
            result += chunk;
          }
          await callback(result, participantId);
        },
      );
      if (errReceive) return op.failure(errReceive);
      return op.success(unsubscribe);
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
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
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  receiveObject(
    topic: string,
    callback: (obj: unknown, participantId: string) => MaybePromise<void>,
  ) {
    try {
      const [err, unsubscribe] = this.receiveText(topic, async (text, participantId) => {
        const deserialized = canon.parse(text);
        await callback(deserialized, participantId);
      });
      if (err) return op.failure(err);
      return op.success(unsubscribe);
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  /**
   * Register a remote procedure.
   * @param procedure - The procedure to register
   */
  register<Schema extends RPCProcedureSchema>(procedure: RPCProcedure<Schema>) {
    this.#procedures.set(procedure.name, procedure);
  }

  /**
   * Call a remote procedure.
   * @param name - The name of the procedure to call
   * @param inputs - The parameters to pass to the procedure
   * @returns A promise that resolves to the response from the procedure
   */
  async call<Schema extends RPCProcedureSchema = RPCProcedureSchema>({
    name,
    input: rawInput,
    inputSchema,
  }: {
    name: string;
    input?: Schema["input"] extends z.ZodObject ? z.infer<Schema["input"]> : SerializableValue;
    inputSchema?: Schema;
  }) {
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      const id = newId("rpc");

      // Validate input data, error if invalid
      const { data: input, error: inputError } = inputSchema?.input
        ? inputSchema.input.safeParse(rawInput)
        : { data: rawInput, error: null };
      if (inputError) return op.failure({ code: "Validation", cause: inputError });

      // Create a timeout promise that resolve with failure after 30 seconds
      const timeoutPromise = new Promise<op.OperationResult<SerializableValue>>((resolve) => {
        timeoutId = setTimeout(() => {
          this.#resolveResults.delete(id);
          resolve(op.failure({ code: "Timeout", message: `RPC timeout after 30s: ${name}` }));
        }, 30_000);
      });

      // Create a promise that resolves when the response is received
      const resultPromise = new Promise<
        op.OperationResult<Schema["output"] extends z.ZodObject ? z.infer<Schema["output"]> : never>
      >((resolve) => {
        this.#resolveResults.set(id, (res) => {
          clearTimeout(timeoutId);
          this.#resolveResults.delete(id);
          resolve(
            res as unknown as op.OperationResult<
              Schema["output"] extends z.ZodObject ? z.infer<Schema["output"]> : never
            >,
          );
        });
      });

      // Send the request
      const request = {
        type: "request",
        id,
        name,
        input: input as SerializableValue,
      } satisfies RPCRequest;
      await this.sendObject("rpc", request);

      // Capture whichever resolves first between timeout or result
      const result = await Promise.race([resultPromise, timeoutPromise]);

      // Clear the timeout
      clearTimeout(timeoutId);

      // Return the result
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  // Initialize RPC
  async #onRPCMessage(rawMessage: unknown) {
    // - Helper to send a response
    let messageId: string | undefined;
    const sendResult = async (_result: op.OperationResult<SerializableValue>) => {
      if (!messageId) return;
      const result = this.#filterPublic ? op.toPublic(_result) : _result;
      const response = { type: "response", id: messageId, result } satisfies RPCResponse;
      await this.sendObject("rpc", response);
    };

    try {
      // Parse and validate the incoming RPC message
      const { data: message, error: messageError } = rpcMessageSchema.safeParse(rawMessage);
      if (messageError) return console.error("Invalid RPC message:", messageError);
      messageId = message.id;

      // Handle responses
      if (message.type === "response") {
        const resolveResult = this.#resolveResults.get(message.id);
        if (resolveResult) await resolveResult(message.result);
        return;
      }

      // Handle requests
      // - Get the local execution function, error if not found
      const procedure = this.#procedures.get(message.name);
      if (!procedure) {
        return await sendResult(
          op.failure({
            code: "NotFound",
            message: `Procedure not found: '${message.name}'.`,
          }),
        );
      }

      // - Parse the procedure's input, error if invalid
      const { data: input, error: inputError } = procedure.schema.input
        ? procedure.schema.input.safeParse(message.input)
        : { data: undefined, error: null };
      if (inputError) {
        return await sendResult(
          op.failure({
            code: "Validation",
            message: `Invalid input parameters for procedure '${message.name}'.`,
            cause: inputError,
          }),
        );
      }

      // - Execute the procedure
      const [err, rawOutput] = await procedure.execute(input as never);
      if (err) return await sendResult(op.failure(err));

      // - Validate the output
      const { data: output, error: outputError } = procedure.schema.output
        ? await procedure.schema.output.safeParseAsync(rawOutput)
        : { data: rawOutput, error: null };
      if (outputError) {
        return await sendResult(
          op.failure({
            code: "Validation",
            message: `Invalid output from procedure '${message.name}'.`,
            cause: outputError,
          }),
        );
      }

      // - Send the output result
      await sendResult(op.success(output as SerializableValue));
    } catch (error) {
      await sendResult(op.failure({ code: "Unknown", cause: error }));
    }
  }

  #startRPC() {
    try {
      const [errReceive, unsubscribe] = this.receiveObject("rpc", this.#onRPCMessage);
      if (errReceive) return op.failure(errReceive);
      this.#rpcUnsubscribe = unsubscribe;
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  #stopRPC() {
    try {
      this.#rpcUnsubscribe?.();
      this.#resolveResults.clear();
      this.#procedures.clear();
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  on: TransportProviderClientBase<z.ZodObject>["on"] = (...args) => this.#provider.on(...args);

  joinRoom: TransportProviderClientBase<z.ZodObject>["joinRoom"] = async (...args) => {
    const [errJoin] = await this.#provider.joinRoom(...args);
    if (errJoin) return op.failure(errJoin);
    const [errStart] = this.#startRPC();
    if (errStart) return op.failure(errStart);
    return op.success();
  };

  leaveRoom: TransportProviderClientBase<z.ZodObject>["leaveRoom"] = async (...args) => {
    const [errLeave] = await this.#provider.leaveRoom(...args);
    if (errLeave) return op.failure(errLeave);
    const [errStop] = this.#stopRPC();
    if (errStop) return op.failure(errStop);
    return op.success();
  };

  streamText: TransportProviderClientBase<z.ZodObject>["streamText"] = (...args) =>
    this.#provider.streamText(...args);

  receiveStreamText: TransportProviderClientBase<z.ZodObject>["receiveStreamText"] = (...args) =>
    this.#provider.receiveStreamText(...args);

  enableMicrophone: TransportProviderClientBase<z.ZodObject>["enableMicrophone"] = (...args) =>
    this.#provider.enableMicrophone(...args);

  playAudio: TransportProviderClientBase<z.ZodObject>["playAudio"] = (...args) =>
    this.#provider.playAudio(...args);

  streamAudioChunk: TransportProviderClientBase<z.ZodObject>["streamAudioChunk"] = (...args) =>
    this.#provider.streamAudioChunk(...args);
}
