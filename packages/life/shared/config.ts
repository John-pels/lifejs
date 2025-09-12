import z from "zod";

export interface Config<
  Schema extends
    | z.AnyZodObject
    | z.ZodDiscriminatedUnion<string, z.ZodDiscriminatedUnionOption<string>[]>,
> {
  schema: Schema;
  schemaTelemetry: Schema;
}

export type DeeplyEditable<T> = T extends Record<string, unknown>
  ? { [K in keyof T]: DeeplyEditable<T[K]> } & Record<string, unknown>
  : T;

/**
 * Creates a Zod schema for a config as well as a sanitized schema excluding
 * any sensitive, unecessary or noisy fields to be used in telemetry.
 * @param schema - The config schema.
 * @param excludedFromTelemetry - The selectors of the fields to exclude from telemetry data.
 * @returns The config schema and the schema prepared for telemetry.
 */
export const createConfig = <Schema extends z.AnyZodObject>({
  schema,
  toTelemetryAttribute = () => ({}),
}: {
  schema: Schema;
  toTelemetryAttribute?: (data: DeeplyEditable<z.output<Schema>>) => Record<string, unknown>;
}) =>
  ({
    schema,
    schemaTelemetry: schema.transform(toTelemetryAttribute as (d: object) => object),
  }) as unknown as Config<Schema>;

export function createConfigUnion<
  Discriminator extends string,
  const Configs extends readonly [
    Config<ZodDiscriminatedUnionOption<Discriminator>>,
    ...Config<ZodDiscriminatedUnionOption<Discriminator>>[],
  ],
>(
  discriminator: Discriminator,
  configs: Configs,
): Config<ConfigUnionSchema<Discriminator, Configs>> {
  // biome-ignore lint/suspicious/noExplicitAny: fine here
  const union = z.discriminatedUnion(discriminator, configs.map((config) => config.schema) as any);
  const unionTelemetry = union.pipe(
    // biome-ignore lint/suspicious/noExplicitAny: fine here
    z.union(configs.map((config) => config.schemaTelemetry) as any),
  );
  return {
    schema: union,
    schemaTelemetry: unionTelemetry as unknown as typeof union,
  };
}

export type ConfigUnionSchema<
  Discriminator extends string,
  Configs extends readonly [
    Config<ZodDiscriminatedUnionOption<Discriminator>>,
    ...Config<ZodDiscriminatedUnionOption<Discriminator>>[],
  ],
> = z.ZodDiscriminatedUnion<
  Discriminator,
  ExtractSchemas<Configs> extends readonly [infer First, ...infer Rest]
    ? First extends ZodDiscriminatedUnionOption<Discriminator>
      ? Rest extends readonly ZodDiscriminatedUnionOption<Discriminator>[]
        ? readonly [First, ...Rest]
        : never
      : never
    : never
>;

type ExtractSchemas<T extends readonly Config<z.AnyZodObject>[]> = {
  [K in keyof T]: T[K] extends Config<infer S> ? S : never;
};

type ZodDiscriminatedUnionOption<Key extends string> = z.ZodObject<
  z.ZodRawShape & { [K in Key]: z.ZodTypeAny },
  z.UnknownKeysParam,
  z.ZodTypeAny
>;
