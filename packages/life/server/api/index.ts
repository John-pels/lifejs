import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import chalk from "chalk";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { timeout } from "hono/timeout";
import type { WSMessageReceive } from "hono/ws";
import z from "zod";
import { AsyncQueue } from "@/shared/async-queue";
import { canon, type SerializableValue } from "@/shared/canon";
import { type LifeError, makePublic } from "@/shared/error";
import { ns } from "@/shared/nanoseconds";
import * as op from "@/shared/operation";
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

    // Setup HTTP requests telemetry
    // this.app.use(async (c, next) => {
    //   const requestId = newId("request");
    //   using h0 = (
    //     await this.server.telemetry.trace(`${c.req.method} ${c.req.path}`, {
    //       method: c.req.method,
    //       path: c.req.path,
    //       requestId,
    //     })
    //   ).start();
    //   c.header("Life-Request-Id", requestId);
    //   try {
    //     await next();
    //   } catch (error) {
    //     span.log.error({ message: `Uncaught error in route: ${c.req.method} ${c.req.path}`, error });
    //   }
    //   span.end();
    //   let statusChalk = chalk.gray;
    //   if (c.res.status >= 500) statusChalk = chalk.red;
    //   else if (c.res.status >= 400) statusChalk = chalk.yellow;
    //   else if (c.res.status >= 300) statusChalk = chalk.cyan;
    //   else if (c.res.status >= 200) statusChalk = chalk.green;
    //   this.server.telemetry.log.info({
    //     message: `(${statusChalk.bold(c.res.status.toString())}) ${c.req.method} ${c.req.path} [in ${chalk.bold(`${ns.toMs(span.getSpan().duration)}ms]`)}`,
    //   });
    // });

    // Setup timeout policy (10s)
    this.app.use("*", timeout(10_000));

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

    // Setup HTTP requests handler
    this.app.post("/http", async (c) => {
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
      "/ws",
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
    return await this.server.telemetry.trace("start()", (span) => {
      try {
        span.log.info({
          message: `Starting API server on http://${this.server.options.host}:${this.server.options.port}`,
        });
        this.#honoServer = serve({
          fetch: this.app.fetch,
          port: Number.parseInt(this.server.options.port, 10),
          hostname: this.server.options.host,
        });
        this.#injectWebSocket?.(this.#honoServer);

        return op.success();
      } catch (error) {
        return op.failure({ code: "Unknown", error });
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
        return op.failure({ code: "Unknown", error });
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
  }): Promise<{ response: string; error?: LifeError | null }> {
    return await this.server.telemetry.trace("handleRequest()", async (span) => {
      span.setAttributes({ inputStr });

      // Helper to sanitize the result (public and stringified result)
      const sanitizeResult = (result: op.OperationResult<unknown>) => {
        const [error, data] = result;
        const resultPublic = error ? op.failure(makePublic(error)) : op.success(data);
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
        const status = error?.httpEquivalent ?? 500;
        let statusChalk = chalk.gray;
        if (status >= 500) statusChalk = chalk.red;
        else if (status >= 400) statusChalk = chalk.yellow;
        else if (status >= 300) statusChalk = chalk.cyan;
        else if (status >= 200) statusChalk = chalk.green;
        this.server.telemetry.log.info({
          message: `${type.toUpperCase()} ${error ? error.code : "Valid"} ${type === "http" ? `(${statusChalk.bold(status)})` : ""} ${handlerId} [in ${chalk.bold(`${ns.toMs(span.getData().duration)}ms]`)}`,
        });

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
        let schema: z.AnyZodObject;
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
              zodError: inputError,
            }),
          );

        // Handle the request based on the handler type
        let output: op.OperationResult<unknown>;
        if (handlerDef.type === "call") {
          output = await this.handleCallRequest({ input: input as LifeApiCallInput, request });
        } else if (handlerDef.type === "cast") {
          output = await this.handleCastRequest({ input: input as LifeApiCastInput });
        } else if (handlerDef.type === "stream") {
          output = await this.handleStreamRequest({
            input: input as LifeApiStreamInput,
            send: (data) => send?.(prepareResponse(data).response),
          });
        } else throw new Error("Should never happen.");

        // Return the prepared response
        return prepareResponse(output);
      } catch (error) {
        return prepareResponse(op.failure({ code: "Unknown", error }));
      }
    });
  }

  async handleCallRequest({ input, request }: { input: LifeApiCallInput; request: Request }) {
    try {
      const handler = getHandlers(this.server.telemetry)[
        input.handlerId as keyof ReturnType<typeof getHandlers>
      ] as LifeApiCallHandler<LifeApiCallDefinition>;
      const response = await handler.onCall({ api: this, data: input.data as never, request });
      return response;
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  async handleCastRequest({ input }: { input: LifeApiCastInput }) {
    try {
      const handler = getHandlers(this.server.telemetry)[
        input.handlerId as keyof ReturnType<typeof getHandlers>
      ] as LifeApiCastHandler<LifeApiCastDefinition>;
      const response = await handler.onCast({ api: this, data: input.data as never });
      return response;
    } catch (error) {
      return op.failure({ code: "Unknown", error });
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
      return op.failure({ code: "Unknown", error });
    }
  }
}
