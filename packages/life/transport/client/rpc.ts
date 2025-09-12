import { z } from "zod";
import * as op from "@/shared/operation";
import { newId } from "@/shared/prefixed-id";
import type { MaybePromise } from "@/shared/types";

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
  result: op.resultSchema,
});

export const rpcMessageSchema = z.discriminatedUnion("type", [rpcRequestSchema, rpcResponseSchema]);

export type RPCRequest<Input = unknown> = Omit<z.infer<typeof rpcRequestSchema>, "input"> & {
  input?: Input;
};

export type RPCResponse<Output = unknown> = Omit<z.infer<typeof rpcResponseSchema>, "output"> & {
  output?: Output;
};

// RPC procedure
type RPCProcedureSchema = { input?: z.AnyZodObject; output?: z.AnyZodObject };
type RPCProcedure<Schema extends RPCProcedureSchema = RPCProcedureSchema> = {
  name: string;
  schema: Schema;
  execute: (
    input: Schema["input"] extends z.AnyZodObject ? z.infer<Schema["input"]> : undefined,
  ) => MaybePromise<
    op.OperationResult<Schema["output"] extends z.AnyZodObject ? z.infer<Schema["output"]> : void>
  >;
};

// RPC transport
export abstract class TransportRPC {
  readonly #procedures = new Map<string, RPCProcedure>();
  readonly #resolveResults = new Map<
    string,
    (value: op.OperationResult<unknown>) => MaybePromise<void>
  >();

  /**
   * Register a remote procedure.
   * @param procedure - The procedure to register
   */
  register<Schema extends RPCProcedureSchema>(procedure: RPCProcedure<Schema>) {
    this.#procedures.set(
      procedure.name,
      procedure as unknown as RPCProcedure<{ input: z.AnyZodObject; output: z.AnyZodObject }>,
    );
  }

  /**
   * Call a remote procedure.
   * @param name - The name of the procedure to call
   * @param inputs - The parameters to pass to the procedure
   * @returns A promise that resolves to the response from the procedure
   */
  async call<Schema extends RPCProcedureSchema = RPCProcedureSchema>({
    name,
    inputSchema: schema,
    input: rawInput,
  }: {
    name: string;
    inputSchema?: Schema;
    input?: Schema["input"] extends z.AnyZodObject ? z.infer<Schema["input"]> : unknown;
  }) {
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      const id = newId("rpc");

      // Validate input data, error if invalid
      const { data: input, error: inputError } = schema?.input
        ? schema.input.safeParse(rawInput)
        : { data: rawInput, error: null };
      if (inputError) return op.failure({ code: "Validation", zodError: inputError });

      // Create a timeout promise that resolve with failure after 30 seconds
      const timeoutPromise = new Promise<op.OperationResult<unknown>>((resolve) => {
        timeoutId = setTimeout(() => {
          this.#resolveResults.delete(id);
          resolve(op.failure({ code: "Timeout", message: `RPC timeout after 30s: ${name}` }));
        }, 30_000);
      });

      // Create a promise that resolves when the response is received
      const resultPromise = new Promise<
        op.OperationResult<
          Schema["output"] extends z.AnyZodObject ? z.infer<Schema["output"]> : never
        >
      >((resolve) => {
        this.#resolveResults.set(id, (res) => {
          clearTimeout(timeoutId);
          this.#resolveResults.delete(id);
          resolve(
            res as unknown as op.OperationResult<
              Schema["output"] extends z.AnyZodObject ? z.infer<Schema["output"]> : never
            >,
          );
        });
      });

      // Send the request
      await this.sendObject("rpc", { type: "request", id, name, input });

      // Capture whichever resolves first between timeout or result
      const result = await Promise.race([resultPromise, timeoutPromise]);

      // Clear the timeout
      clearTimeout(timeoutId);

      // Return the result
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      return op.failure({ code: "Unknown", error });
    }
  }

  protected initRPC() {
    this.receiveObject("rpc", async (data) => {
      // - Helper to send a response
      let messageId: string | undefined;
      const sendResult = async (result: op.OperationResult<unknown>) => {
        if (!messageId) return;
        await this.sendObject("rpc", { type: "response", id: messageId, result });
      };

      try {
        // Parse and validate the incoming RPC message
        const { data: message, error: messageError } = rpcMessageSchema.safeParse(data);
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
              zodError: inputError ?? undefined,
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
              zodError: outputError ?? undefined,
            }),
          );
        }

        // - Send the output result
        await sendResult(op.success(output));
      } catch (error) {
        await sendResult(op.failure({ code: "Unknown", error }));
      }
    });
  }

  abstract sendObject(topic: string, obj: unknown): Promise<op.OperationResult<void>>;
  abstract receiveObject(topic: string, callback: (obj: unknown) => void): op.OperationResult<void>;
}
