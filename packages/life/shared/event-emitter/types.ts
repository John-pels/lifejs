import type z from "zod";
import type { MaybePromise } from "../types";

// Definition
export type EventEmitterDefinition = readonly {
  name: string;
  dataSchema?: z.ZodType;
}[];

// Event
export type EventEmitterEvent<
  Definition extends EventEmitterDefinition = EventEmitterDefinition,
  T extends "input" | "output" = "output",
> = Definition extends readonly (infer E)[]
  ? E extends { name: infer N; dataSchema?: infer S }
    ? (T extends "input" ? unknown : { id: string }) & {
        name: N;
        data: S extends z.ZodType ? (T extends "input" ? z.input<S> : z.output<S>) : undefined;
      }
    : never
  : never;

// Selector
export type EventEmitterSelector<Definition extends EventEmitterDefinition> =
  | Definition[number]["name"]
  | readonly Definition[number]["name"][]
  | "*";

type SelectorToNames<
  Definition extends EventEmitterDefinition,
  S extends EventEmitterSelector<Definition>,
> = S extends "*"
  ? Definition[number]["name"]
  : S extends readonly (infer N)[]
    ? N & Definition[number]["name"]
    : S & Definition[number]["name"];

// Callback
export type EventEmitterCallback<
  Definition extends EventEmitterDefinition,
  Selector extends EventEmitterSelector<Definition> = "*",
> = (
  event: Selector extends "*"
    ? EventEmitterEvent<Definition, "output">
    : Extract<
        EventEmitterEvent<Definition, "output">,
        { name: SelectorToNames<Definition, Selector> }
      >,
) => MaybePromise<void>;

// Listener
export type EventEmitterListener<Definition extends EventEmitterDefinition> =
  | { location: "remote"; selector: EventEmitterSelector<Definition> }
  | {
      location: "local";
      selector: EventEmitterSelector<Definition>;
      callback: EventEmitterCallback<Definition>;
    };
