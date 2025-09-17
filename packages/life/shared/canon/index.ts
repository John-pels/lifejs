import { equal } from "./equal";
import { equalSchema } from "./equal-schema";
import { deserialize, serialize } from "./serialize";
import { sha256 } from "./sha256";
import { parse, stringify } from "./stringify";

export const canon = {
  equal,
  equalSchema,
  serialize,
  deserialize,
  sha256,
  stringify,
  parse,
};

export type { SerializableValue, SerializeResult, serializableValueSchema } from "./serialize";
