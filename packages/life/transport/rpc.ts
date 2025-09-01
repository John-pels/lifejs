import { z } from "zod";
import { newId } from "@/shared/prefixed-id";

// RPC messages
export const rpcRequestSchema = z.object({
  type: z.literal("request"),
  id: z.string(),
  name: z.string(),
  input: z.unknown().optional(),
});

export const rpcResponseSchema = z.object({
  type: z.literal("response"),
  id: z.string(),
  name: z.string(),
  status: z.enum(["success", "error"]),
  data: z.unknown().optional(),
  error: z
    .object({
      code: z.enum(["NOT_FOUND", "INVALID_INPUT", "INVALID_OUTPUT", "UNKNOWN", "TIMEOUT"]),
      message: z.string(),
      raw: z.unknown().optional(),
    })
    .optional(),
});

export const rpcMessageSchema = z.discriminatedUnion("type", [rpcRequestSchema, rpcResponseSchema]);

export type RPCRequest<Input = unknown> = z.infer<typeof rpcRequestSchema> & {
  input?: Input;
};

export type RPCResponse<Data = unknown> = z.infer<typeof rpcResponseSchema> & {
  data?: Data;
};

// RPC procedure
type RPCProcedureSchema = { input?: z.AnyZodObject; output?: z.AnyZodObject };
type RPCProcedure<Schema extends RPCProcedureSchema = RPCProcedureSchema> = {
  name: string;
  schema: Schema;
  execute: (
    input: Schema["input"] extends z.AnyZodObject ? z.infer<Schema["input"]> : undefined,
  ) => Schema["output"] extends z.AnyZodObject ? z.infer<Schema["output"]> : void;
};

// RPC transport
export abstract class TransportRPC {
  readonly #procedures = new Map<string, RPCProcedure>();
  readonly #pendingResponses = new Map<string, (value: RPCResponse) => Promise<void>>();

  /**
   * Register a remote procedure.
   * @param procedure - The procedure to register
   */
  register<Schema extends RPCProcedureSchema>(procedure: RPCProcedure<Schema>) {
    this.#procedures.set(procedure.name, procedure as unknown as RPCProcedure);
  }

  /**
   * Call a remote procedure.
   * @param name - The name of the procedure to call
   * @param inputs - The parameters to pass to the procedure
   * @returns A promise that resolves to the response from the procedure
   */
  async call<Schema extends RPCProcedureSchema = RPCProcedureSchema>({
    name,
    input,
    schema,
  }: {
    name: string;
    input?: Schema["input"] extends z.AnyZodObject ? z.infer<Schema["input"]> : never;
    schema?: Schema;
  }): Promise<
    RPCResponse<Schema["output"] extends z.AnyZodObject ? z.infer<Schema["output"]> : never>
  > {
    // - Generate a new procedure ID
    const id = newId("rpc");

    // - Prepare the response promise
    const responsePromise = new Promise((resolve) => {
      // Return a timeout error after 30s
      const timeout = setTimeout(() => {
        this.#pendingResponses.delete(id);
        resolve({
          type: "response",
          id,
          name,
          status: "error",
          error: {
            code: "TIMEOUT",
            message: `RPC timeout after 30s: ${name}`,
          },
        });
      }, 30_000);

      // Add the call to the pending responses map
      this.#pendingResponses.set(id, async (response: RPCResponse) => {
        clearTimeout(timeout);
        this.#pendingResponses.delete(id);

        // Validate the response output if schema is provided and response was successful
        if (schema && response.status === "success" && schema.output) {
          const outputResult = await schema.output?.safeParseAsync(response.data);
          if (!outputResult.success) {
            return resolve({
              id: response.id,
              name: response.name,
              type: "response",
              status: "error",
              error: {
                code: "INVALID_OUTPUT",
                message: `Invalid output from procedure '${response.name}'.`,
                raw: outputResult.error,
              },
            });
          }
        }

        // Resolve the response promise as is if valid or no schema was provided
        resolve(response);
      });
    });

    // - Send the request
    const request: RPCRequest = { type: "request", id, name, input };
    await this.sendObject("rpc", request);

    // - Return the response promise
    return responsePromise as Promise<
      RPCResponse<Schema["output"] extends z.AnyZodObject ? z.infer<Schema["output"]> : never>
    >;
  }

  protected initRPC() {
    this.receiveObject("rpc", async (data) => {
      // Parse and validate the incoming RPC message
      const parsed = rpcMessageSchema.safeParse(data);
      if (!parsed.success) return console.error("Invalid RPC message:", parsed.error);
      const message = parsed.data;

      // Handle responses
      if (message.type === "response") {
        const response = this.#pendingResponses.get(message.id);
        if (response) await response(message);
        return;
      }

      // Handle requests
      // - Get the local execution function, or error if not found
      try {
        const procedure = this.#procedures.get(message.name);
        if (!procedure) {
          const response: RPCResponse = {
            type: "response",
            id: message.id,
            name: message.name,
            status: "error",
            error: {
              code: "NOT_FOUND",
              message: `Procedure not found: '${message.name}'.`,
            },
          };
          await this.sendObject("rpc", response);
          return;
        }

        // - Parse the procedure's input, or error if invalid
        // Default to empty array if input not provided (for procedures with no arguments)
        const inputResult = procedure.schema.input
          ? procedure.schema.input.safeParse(message.input)
          : { success: true, data: undefined, error: null };
        if (!inputResult.success) {
          const response: RPCResponse = {
            type: "response",
            id: message.id,
            name: message.name,
            status: "error",
            error: {
              code: "INVALID_INPUT",
              message: `Invalid input parameters for procedure '${message.name}'.`,
              raw: inputResult.error,
            },
          };
          await this.sendObject("rpc", response);
          return;
        }

        // @ts-expect-error - Execute the procedure
        const output = await procedure.execute(inputResult.data);

        // - Validate the output
        const outputResult = procedure.schema.output
          ? await procedure.schema.output.safeParseAsync(output)
          : { success: true, data: output, error: null };
        if (!outputResult.success) {
          const response: RPCResponse = {
            type: "response",
            id: message.id,
            name: message.name,
            status: "error",
            error: {
              code: "INVALID_OUTPUT",
              message: `Invalid output from procedure '${message.name}'.`,
              raw: outputResult.error,
            },
          };
          await this.sendObject("rpc", response);
          return;
        }

        // - Send the response
        const response: RPCResponse = {
          name: message.name,
          type: "response",
          id: message.id,
          status: "success",
          data: outputResult.data,
        };
        await this.sendObject("rpc", response);
      } catch (err) {
        const response: RPCResponse = {
          type: "response",
          id: message.id,
          name: message.name,
          status: "error",
          error: {
            code: "UNKNOWN",
            message: err instanceof Error ? err.message : String(err),
            raw: err,
          },
        };
        await this.sendObject("rpc", response);
      }
    });
  }

  abstract sendObject(topic: string, obj: unknown): Promise<void>;
  abstract receiveObject(topic: string, callback: (obj: unknown) => void): void;
}
