import type z from "zod";
import { canon, type SerializableValue } from "@/shared/canon";
import { type LifeError, obfuscateLifeError } from "@/shared/error";
import { newId } from "@/shared/id";
import * as op from "@/shared/operation";
import type { MaybePromise, Todo } from "@/shared/types";
import type { TelemetryClient } from "@/telemetry/clients/base";
import type { TransportProviderBase } from "../providers/base";
import { rpcMessageSchema } from "../schemas";
import type {
  TransportRPCProcedure,
  TransportRPCProcedureSchema,
  TransportRPCRequest,
} from "../types";

// Runtime-agnostic logic between transport classes
export abstract class TransportClientBase {
  readonly #provider: TransportProviderBase<z.ZodObject>;
  readonly #obfuscateErrors: boolean;
  readonly #procedures = new Map<string, TransportRPCProcedure>();
  readonly #resolveResults = new Map<
    string,
    (value?: op.OperationResult<SerializableValue>) => MaybePromise<void>
  >();
  readonly #telemetry: TelemetryClient | null = null;
  #rpcUnsubscribe?: () => void;

  constructor({
    provider,
    telemetry,
    obfuscateErrors = false,
  }: {
    provider: TransportProviderBase<z.ZodObject>;
    obfuscateErrors?: boolean;
    telemetry?: TelemetryClient | null;
  }) {
    this.#provider = provider;
    this.#obfuscateErrors = obfuscateErrors;
    this.#telemetry = telemetry ?? null;
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
    onError?: (error: LifeError) => void,
  ) {
    try {
      const [errReceive, unsubscribe] = this.receiveStreamText(
        topic,
        async (iterator: AsyncIterable<string>, participantId: string) => {
          const [err] = await op.attempt(async () => {
            let result = "";
            for await (const chunk of iterator) result += chunk;
            await callback(result, participantId);
          });
          if (err) onError?.(err);
        },
        onError,
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
    onError?: (error: LifeError) => void,
  ) {
    try {
      const [err, unsubscribe] = this.receiveText(
        topic,
        async (text, participantId) => {
          try {
            // Parse the text into an object
            const [errParse, deserialized] = canon.parse(text);
            if (errParse) return onError?.(errParse);

            // Call the callback
            const [errCallback] = await op.attempt(
              async () => await callback(deserialized, participantId),
            );
            if (errCallback) return onError?.(errCallback);
          } catch (error) {
            onError?.(error as LifeError);
          }
        },
        onError,
      );

      // Return the unsubscribe function
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
  register<Schema extends TransportRPCProcedureSchema>(procedure: TransportRPCProcedure<Schema>) {
    this.#procedures.set(procedure.name, procedure);
  }

  /**
   * Call a remote procedure.
   * @param name - The name of the procedure to call
   * @param inputs - The parameters to pass to the procedure
   * @returns A promise that resolves to the response from the procedure
   */
  async call<Schema extends TransportRPCProcedureSchema>({
    name,
    schema,
    input,
    timeoutMs = 10_000,
  }: {
    name: string;
    schema?: Schema;
    timeoutMs?: number;
  } & (Schema["input"] extends z.ZodObject
    ? { input: z.infer<Schema["input"]> }
    : { input?: never })): Promise<
    op.OperationResult<Schema["output"] extends z.ZodObject ? z.infer<Schema["output"]> : undefined>
  > {
    const id = newId("rpc");

    try {
      // Validate input data
      let parsedInput: SerializableValue | undefined;
      if (schema?.input) {
        const { error: errInput, data: parsedInput_ } = schema.input.safeParse(input);
        if (errInput) return op.failure({ code: "Validation", cause: errInput });
        parsedInput = parsedInput_ as SerializableValue;
      }

      // Prepare a resolver and timeout promises
      const resultPromise = new Promise<
        op.OperationResult<Schema["output"] extends z.ZodObject ? z.infer<Schema["output"]> : never>
      >((resolve) => {
        this.#resolveResults.set(id, (res) => {
          resolve(
            res as unknown as op.OperationResult<
              Schema["output"] extends z.ZodObject ? z.infer<Schema["output"]> : never
            >,
          );
        });
      });

      const timeoutPromise = new Promise<op.OperationResult<SerializableValue>>((resolve) => {
        setTimeout(() => {
          resolve(
            op.failure({
              code: "Timeout",
              message: `RPC call to procedure '${name}' timed out after ${timeoutMs}ms.`,
            }),
          );
        }, timeoutMs);
      });

      // Call the procedure
      const [errCall] = await this.sendObject("rpc", {
        type: "request",
        id,
        name,
        ...(parsedInput ? { input: parsedInput } : {}),
      } satisfies TransportRPCRequest);
      if (errCall) return op.failure(errCall);

      // Capture whichever resolves first between the timeout and result
      const [err, data] = await Promise.race([resultPromise, timeoutPromise]);

      // Return the error if any
      if (err) return op.failure(err);

      // Validate the output data
      if (schema?.output) {
        const { error: errOutput, data: parsedOutput } = schema.output.safeParse(data);
        if (errOutput) return op.failure({ code: "Validation", cause: errOutput });
        return op.success(parsedOutput) as Todo;
      }
      return op.success() as Todo;
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    } finally {
      this.#resolveResults.delete(id);
    }
  }

  async #onRPCMessage(rawMessage: unknown) {
    try {
      // Validate the incoming RPC message shape
      const { data: parsedMessage, error: messageError } = rpcMessageSchema.safeParse(rawMessage);
      if (messageError)
        return this.#telemetry?.log.error({
          message: "Invalid RPC message.",
          error: messageError,
        });

      // Handle responses
      if (parsedMessage.type === "response") {
        const resolveResult = this.#resolveResults.get(parsedMessage.id);
        if (resolveResult) await resolveResult(parsedMessage.result);
        return;
      }

      // Handle requests
      // - Helper to send a response
      // biome-ignore lint/style/useConst: biome bug
      let procedure: TransportRPCProcedure | undefined;
      const requestMessage = parsedMessage as TransportRPCRequest;
      const sendResult = async (result: op.OperationResult<SerializableValue>) => {
        let [error, data] = result;

        // Log error
        if (error)
          this.#telemetry?.log.error({
            message: `Failed to respond to RPC request for handler '${requestMessage.name}'.`,
            error,
          });

        // Obfuscate the error if required
        if (this.#obfuscateErrors && error) error = obfuscateLifeError(error);

        // Send the response
        const [errSend] = await this.sendObject("rpc", {
          type: "response",
          id: requestMessage.id,
          result: error ? op.failure(error) : op.success(data),
        });
        if (errSend)
          return this.#telemetry?.log.error({
            message: "Failed to send RPC response.",
            error: errSend,
          });
      };

      // - Get the local procedure function, error if not found
      procedure = this.#procedures.get(parsedMessage.name);
      if (!procedure)
        return await sendResult(
          op.failure({
            code: "NotFound",
            message: `Procedure not found: '${parsedMessage.name}'.`,
          }),
        );

      // - Parse the procedure's input, error if invalid
      const { data: input, error: inputError } = procedure.schema?.input
        ? procedure.schema.input.safeParse(parsedMessage.input)
        : { data: undefined, error: null };
      if (inputError)
        return await sendResult(
          op.failure({
            code: "Validation",
            message: `Invalid input parameters for procedure '${parsedMessage.name}'.`,
            cause: inputError,
          }),
        );

      // - Execute the procedure
      const [err, rawOutput] = await procedure.execute(input as never);
      if (err) return await sendResult(op.failure(err));

      // - Validate the output
      const { data: output, error: outputError } = procedure.schema?.output
        ? await procedure.schema.output.safeParseAsync(rawOutput)
        : { data: rawOutput, error: null };
      if (outputError) {
        return await sendResult(
          op.failure({
            code: "Validation",
            message: `Invalid output from procedure '${parsedMessage.name}'.`,
            cause: outputError,
          }),
        );
      }

      // - Send the output result
      return await sendResult(op.success(output as SerializableValue));
    } catch (error) {
      this.#telemetry?.log.error({ message: "Unknown error while handling RPC message.", error });
    }
  }

  #startRPC() {
    try {
      const [errReceive, unsubscribe] = this.receiveObject("rpc", this.#onRPCMessage.bind(this));
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

  on: TransportProviderBase<z.ZodObject>["on"] = (...args) => this.#provider.on(...args);

  joinRoom: TransportProviderBase<z.ZodObject>["joinRoom"] = async (...args) => {
    const [errJoin] = await this.#provider.joinRoom(...args);
    if (errJoin) return op.failure(errJoin);
    const [errStart] = this.#startRPC();
    if (errStart) return op.failure(errStart);
    return op.success();
  };

  leaveRoom: TransportProviderBase<z.ZodObject>["leaveRoom"] = async (...args) => {
    const [errLeave] = await this.#provider.leaveRoom(...args);
    if (errLeave) return op.failure(errLeave);
    const [errStop] = this.#stopRPC();
    if (errStop) return op.failure(errStop);
    return op.success();
  };

  streamText: TransportProviderBase<z.ZodObject>["streamText"] = (...args) =>
    this.#provider.streamText(...args);

  receiveStreamText: TransportProviderBase<z.ZodObject>["receiveStreamText"] = (...args) =>
    this.#provider.receiveStreamText(...args);

  enableMicrophone: TransportProviderBase<z.ZodObject>["enableMicrophone"] = (...args) =>
    this.#provider.enableMicrophone(...args);

  playAudio: TransportProviderBase<z.ZodObject>["playAudio"] = (...args) =>
    this.#provider.playAudio(...args);

  streamAudioChunk: TransportProviderBase<z.ZodObject>["streamAudioChunk"] = (...args) =>
    this.#provider.streamAudioChunk(...args);
}
