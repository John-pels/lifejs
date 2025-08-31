import type z from "zod";

type ConfigSchema =
  | z.AnyZodObject
  | z.ZodDiscriminatedUnion<string, z.ZodDiscriminatedUnionOption<string>[]>
  | z.ZodDefault<z.AnyZodObject>;

export type Config<
  ClientSchema extends ConfigSchema = ConfigSchema,
  ServerSchema extends ConfigSchema = ConfigSchema,
> = {
  serverSchema: ServerSchema;
  clientSchema: ClientSchema;
};

/**
 * Creates a configuration definition pairing server and client schemas.
 * The server schema typically contains more fields than the client schema.
 */
export const createConfig = <ClientSchema extends ConfigSchema, ServerSchema extends ConfigSchema>(
  config: Config<ClientSchema, ServerSchema>,
) => config;
