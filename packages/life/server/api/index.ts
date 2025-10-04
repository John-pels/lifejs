import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import chalk from "chalk";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { WSMessageReceive } from "hono/ws";
import z from "zod";
import { themeChalk } from "@/cli/utils/theme";
import { AsyncQueue } from "@/shared/async-queue";
import { canon, type SerializableValue } from "@/shared/canon";
import { type LifeErrorUnion, obfuscateLifeError } from "@/shared/error";
import { ns } from "@/shared/nanoseconds";
import * as op from "@/shared/operation";
import type { MaybePromise } from "@/shared/types";
import type { LifeServer } from "..";
import { definition } from "./definition";
import { getHandlers } from "./handlers";
import {
  type LifeApiCallDefinition,
  type LifeApiCallHandler,
  type LifeApiCallInput,
  type LifeApiCastDefinition,
  type LifeApiCastHandler,
  type LifeApiCastInput,
  type LifeApiHandlerDefinition,
  type LifeApiStreamDefinition,
  type LifeApiStreamHandler,
  type LifeApiStreamInput,
  type LifeApiStreamQueueEvent,
  type LifeApiStreamSendFunction,
  lifeApiBaseInputSchema,
  lifeApiCallInputSchema,
  lifeApiCastInputSchema,
  lifeApiStreamInputSchema,
} from "./types";

export class LifeApi {
  app = new Hono();
  server: LifeServer;
  #honoServer: ReturnType<typeof serve> | null = null;
  #injectWebSocket: ReturnType<typeof createNodeWebSocket>["injectWebSocket"];
  #streamHandlersQueues = new Map<
    string,
    AsyncQueue<LifeApiStreamQueueEvent<LifeApiStreamDefinition>>
  >();

  constructor(server: LifeServer) {
    this.server = server;

    // Setup CORS policy
    this.app.use(
      "*",
      cors({
        credentials: true,
        origin: "*",
      }),
    );

    // Setup body limit policy (50kb)
    this.app.use(
      "*",
      bodyLimit({
        maxSize: 50 * 1024,
        onError: (c) =>
          c.json(op.failure({ code: "Validation", message: "Request body is too large." }), 413),
      }),
    );

    this.app.get("/api", (c) => {
      return c.text("Hello Life.", 200, {
        "Content-Type": "application/json",
      });
    });

    // Setup HTTP requests handler
    this.app.post("/api/http", async (c) => {
      const { response, error } = await this.handleRequest({
        type: "http",
        request: c.req.raw,
        inputStr: await c.req.text(),
      });

      return c.text(response, (error?.httpEquivalent as 200) ?? 200, {
        "Content-Type": "application/json",
      });
    });

    // Setup WebSocket messages handler
    const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: this.app });
    this.#injectWebSocket = injectWebSocket;
    this.app.get(
      "/api/ws",
      upgradeWebSocket((c) => ({
        onMessage: async (event, ws) => {
          const { response } = await this.handleRequest({
            type: "ws",
            inputStr: event.data,
            request: c.req.raw,
            send: (message) => ws.send(message),
          });
          ws.send(response);
        },
        onClose: () => {
          this.server.telemetry.log.info({ message: "WebSocket connection closed." });
        },
        onOpen: () => {
          this.server.telemetry.log.info({ message: "WebSocket connection opened." });
        },
        onError: () => {
          this.server.telemetry.log.error({ message: "WebSocket error." });
        },
      })),
    );

    // Start stream handlers
    for (const [handlerId, handlerDef] of Object.entries(definition)) {
      if (handlerDef.type === "stream") {
        const queue = new AsyncQueue<LifeApiStreamQueueEvent<LifeApiStreamDefinition>>();
        this.#streamHandlersQueues.set(handlerId, queue);
        const handler = getHandlers(this.server.telemetry)[
          handlerId as keyof ReturnType<typeof getHandlers>
        ] as LifeApiStreamHandler<LifeApiStreamDefinition>;
        handler.onStart({
          api: this,
          queue,
        });
      }
    }
  }

  async start() {
    return await this.server.telemetry.trace("start()", () => {
      try {
        this.#honoServer = serve({
          fetch: this.app.fetch,
          port: Number.parseInt(this.server.options.port, 10),
          hostname: this.server.options.host,
        });
        this.#injectWebSocket?.(this.#honoServer);

        return op.success();
      } catch (error) {
        return op.failure({ code: "Unknown", cause: error });
      }
    });
  }

  async stop() {
    return await this.server.telemetry.trace("stop()", async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            this.server.telemetry.log.error({
              message: "API server took longer than 10 seconds to close (timeout).",
            });
            reject(new Error("API server took longer than 10 seconds to close (timeout)."));
          }, 10_000);
          if (!this.#honoServer) return resolve();
          this.#honoServer.close((err) => {
            clearTimeout(timeoutId);
            if (err) reject(err);
            else resolve();
          });
        });
        this.#honoServer = null;

        return op.success();
      } catch (error) {
        return op.failure({ code: "Unknown", cause: error });
      }
    });
  }

  async handleRequest({
    type,
    inputStr,
    request,
    send,
  }: {
    type: "http" | "ws";
    inputStr: string | WSMessageReceive;
    request: Request;
    send?: (message: string) => void;
  }): Promise<{ response: string; error?: LifeErrorUnion | null }> {
    return await this.server.telemetry.trace("handleRequest()", async (span) => {
      span.setAttributes({ inputStr });

      // Helper to sanitize the result (public and stringified result)
      const sanitizeResult = (result: op.OperationResult<unknown>) => {
        const [error, data] = result;
        const resultPublic = error ? op.failure(obfuscateLifeError(error)) : op.success(data);
        const [errorCanon, response] = canon.stringify(
          resultPublic as unknown as SerializableValue,
        );
        if (errorCanon)
          return sanitizeResult(
            op.failure({ code: "Internal", message: "Failed to serialize response." }),
          );
        return { response, error };
      };

      // Helper to prepare the response
      let handlerId = "(unknown)";
      const prepareResponse = (result: op.OperationResult<unknown>) => {
        // Log the request
        const [error] = result;
        const status = error ? (error.httpEquivalent ?? 500) : 200;
        let statusColor = chalk.gray;
        if (status >= 400) statusColor = themeChalk.level.error;
        else if (status >= 300) statusColor = themeChalk.level.info;
        else if (status >= 200) statusColor = chalk.green;
        const logFn =
          status >= 400 ? this.server.telemetry.log.error : this.server.telemetry.log.info;
        logFn({
          message: `Request ${type === "http" ? `${statusColor.bold(status)}` : ""} /${handlerId} in ${chalk.bold(`${ns.toMs(span.getData().duration)}ms.`)}`,
          error,
        });

        // Log the raw input if the request failed
        if (status >= 400) {
          this.server.telemetry.log.debug({
            message: `Failed request raw input: ${(typeof inputStr === "string" ? inputStr : "Non-string data.") ?? "No data."}`,
          });
        }

        // Return the sanitized result
        return sanitizeResult(result);
      };

      // Process the message
      try {
        // Ensure input is a string
        if (typeof inputStr !== "string")
          return prepareResponse(
            op.failure({
              code: "Validation",
              message: `${type === "ws" ? "WebSocket message" : "HTTP request body"} must be a string.`,
            }),
          );

        // Try to deserialize the data
        const [errCanon, inputRaw] = canon.parse(inputStr);
        if (errCanon) return prepareResponse(op.failure(errCanon));

        // Ensure the message is a valid input object
        const { data: rawInput, error: rawInputError } = lifeApiBaseInputSchema.safeParse(inputRaw);
        if (rawInputError)
          return prepareResponse(
            op.failure({
              code: "Validation",
              message: `Input object must contain a 'handlerId' field.`,
            }),
          );

        // Ensure the handlerId is valid
        const handlerDef = definition[
          rawInput.handlerId as keyof typeof definition
        ] as unknown as LifeApiHandlerDefinition;
        if (!handlerDef) {
          handlerId = `${rawInput.handlerId} (unknown)`;
          return prepareResponse(
            op.failure({
              code: "Validation",
              message: `Input object 'type' key must be one of the following: ${Object.keys(getHandlers(this.server.telemetry)).join(", ")}`,
            }),
          );
        }
        handlerId = rawInput.handlerId;

        // Validate the input
        let schema: z.ZodObject;
        if (handlerDef.type === "stream") schema = lifeApiStreamInputSchema;
        else if (handlerDef.type === "call") schema = lifeApiCallInputSchema;
        else if (handlerDef.type === "cast") schema = lifeApiCastInputSchema;
        else throw new Error("Should never happen.");
        schema = schema.extend({
          data: handlerDef.inputDataSchema ?? z.any(),
        });
        const { data: input, error: inputError } = schema.safeParse(rawInput);
        if (inputError)
          return prepareResponse(
            op.failure({
              code: "Validation",
              message: `Invalid input shape for handler '${rawInput.handlerId}'.`,
              cause: inputError,
            }),
          );

        // Prepare a timeout promise
        const timeoutPromise = new Promise<op.OperationResult<unknown>>((resolve) => {
          setTimeout(() => {
            resolve(
              op.failure({
                code: "Timeout",
                message: `Request to handler '${rawInput.handlerId}' timed out.`,
                isPublic: true,
              }),
            );
          }, handlerDef.timeoutMs ?? 10_000);
        });

        // Handle the request based on the handler type
        let outputPromise: MaybePromise<op.OperationResult<unknown>>;
        if (handlerDef.type === "call") {
          outputPromise = this.handleCallRequest({ input: input as LifeApiCallInput, request });
        } else if (handlerDef.type === "cast") {
          outputPromise = this.handleCastRequest({ input: input as LifeApiCastInput });
        } else if (handlerDef.type === "stream") {
          outputPromise = this.handleStreamRequest({
            input: input as LifeApiStreamInput,
            send: (data) => send?.(prepareResponse(data).response),
          });
        } else throw new Error("Should never happen.");

        // Capture whichever resolves first between timeout or result
        const output = await Promise.race([timeoutPromise, outputPromise]);

        // Return the prepared response
        return prepareResponse(output);
      } catch (error) {
        return prepareResponse(op.failure({ code: "Unknown", cause: error }));
      }
    });
  }

  async handleCallRequest({ input, request }: { input: LifeApiCallInput; request: Request }) {
    try {
      const handler = getHandlers(this.server.telemetry)[
        input.handlerId as keyof ReturnType<typeof getHandlers>
      ] as LifeApiCallHandler<LifeApiCallDefinition>;
      const result = await handler.onCall({ api: this, data: input.data as never, request });
      return result;
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  async handleCastRequest({ input }: { input: LifeApiCastInput }) {
    try {
      const handler = getHandlers(this.server.telemetry)[
        input.handlerId as keyof ReturnType<typeof getHandlers>
      ] as LifeApiCastHandler<LifeApiCastDefinition>;
      const result = await handler.onCast({ api: this, data: input.data as never });
      return result;
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  handleStreamRequest({
    input,
    send,
  }: {
    input: LifeApiStreamInput;
    send: LifeApiStreamSendFunction<LifeApiStreamDefinition>;
  }) {
    try {
      const queue = this.#streamHandlersQueues.get(input.handlerId);
      if (!queue) return op.failure({ code: "Validation", message: "Stream queue not found." });
      queue.push({
        action: input.action === "subscribe" ? "add" : "remove",
        subscriptionId: input.subscriptionId,
        data: input.data as never,
        send,
      });
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }
}
