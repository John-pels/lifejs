import z from "zod";

type DeeplyEditable<T> =
  T extends Record<string, unknown>
    ? { [K in keyof T]: DeeplyEditable<T[K]> } & Record<string, unknown>
    : T;

// Zod Object With Telemetry
export type ZodObjectWithTelemetry<Schema extends z.ZodObject, D extends "input" | "output"> = {
  schema: Schema;
} & (D extends "input"
  ? {
      toTelemetry?: (data: DeeplyEditable<z.output<Schema>>) => Record<string, unknown>;
    }
  : {
      toTelemetry: (data: Record<string, unknown>) => Record<string, unknown>;
    });

/**
 * Creates a ZodObject schema alongside a `toTelemetry()` function responsible for sanitizing
 * the data parsed by the schema when this data needs to be included into a telemetry signal.
 *
 * @param schema - The Zod schema
 * @param toTelemetry - The sanitizing function.
 * @returns The schema prepared for telemetry.
 */
export const zodObjectWithTelemetry = <const Schema extends z.ZodObject>({
  schema,
  toTelemetry,
}: ZodObjectWithTelemetry<Schema, "input">): ZodObjectWithTelemetry<Schema, "output"> => ({
  schema,
  toTelemetry: (data: Record<string, unknown>) => (toTelemetry ? toTelemetry(data as never) : data),
});

// Zod Union With Telemetry
export interface ZodUnionWithTelemetry<
  Discriminator extends string,
  Objects extends readonly ZodObjectWithTelemetry<
    z.ZodObject<z.ZodRawShape & { [K in Discriminator]: z.ZodTypeAny }>,
    "output"
  >[],
  Schema = z.ZodDiscriminatedUnion<
    Objects[number] extends ZodObjectWithTelemetry<infer S extends z.ZodObject, "output">
      ? S[]
      : never,
    Discriminator
  >,
> {
  schema: Schema;
  toTelemetry: (data: DeeplyEditable<z.output<Schema>>) => Record<string, unknown>;
}

/**
 * Creates a union of ZodObjectWithTelemetry instances discriminated by a given key.
 * The returned `toTelemetry()` function will apply the `toTelemetry()` function of
 * matched ZodObjectWithTelemetry instance.
 *
 * @param discriminator - The field to discriminate by.
 * @param objects - Array of ZodObjectWithTelemetry instances.
 * @returns A unified ZodObjectWithTelemetry with a discriminated union schema.
 */
export const zodUnionWithTelemetry = <
  const Discriminator extends string,
  const Objects extends readonly ZodObjectWithTelemetry<
    z.ZodObject<z.ZodRawShape & { [K in Discriminator]: z.ZodTypeAny }>,
    "output"
  >[],
>(
  discriminator: Discriminator,
  objects: Objects,
): ZodUnionWithTelemetry<Discriminator, Objects> => ({
  schema: z.discriminatedUnion(discriminator, objects.map((s) => s.schema) as never),
  toTelemetry: (data: Record<string, unknown>) => {
    // Find the schema that matches the discriminator
    const object = objects.find((s) => {
      const discriminatorSchema = s.schema.shape[discriminator];
      if (discriminatorSchema instanceof z.ZodLiteral)
        return discriminatorSchema.def.values[0] === data[discriminator];
      return false;
    });

    // Apply the telemetry transformation (if any)
    return object?.toTelemetry ? object.toTelemetry(data as never) : data;
  },
});
