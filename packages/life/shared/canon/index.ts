import { equal } from "./equal";
import { murmur3 } from "./murmur3";
import { deserialize, serialize } from "./serialize";
import { sha256 } from "./sha256";
import { parse, stringify } from "./stringify";

export const canon = {
  equal,
  serialize,
  deserialize,
  stringify,
  parse,
  sha256,
  murmur3,
};

export type { SerializableValue, SerializedValue as SerializeResult, serializableValueSchema } from "./serialize";
