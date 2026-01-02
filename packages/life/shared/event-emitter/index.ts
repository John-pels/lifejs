import z from "zod";
import { newId } from "@/shared/id";
import * as op from "@/shared/operation";
import type { TransportClient } from "@/transport/types";
import { eventSchema, selectorSchema } from "./schemas";
import type {
  EventEmitterCallback,
  EventEmitterDefinition,
  EventEmitterEvent,
  EventEmitterListener,
  EventEmitterSelector,
} from "./types";

/**
 * A minimal events emitter standard class, supporting:
 * - Zod-based events validation
 * - Subscribing to one, many, or all events at once
 * - Streaming events over TransportClient (optional)
 */
export abstract class EventEmitter<Definition extends EventEmitterDefinition> {
  readonly #definition: Definition;
  readonly #transport?: TransportClient;
  readonly #prefix?: string;
  readonly #listeners = new Map<string, EventEmitterListener<Definition>>();

  constructor(
    definition: Definition,
    transportConfig?: {
      transport: TransportClient;
      prefix: string;
    },
  ) {
    this.#transport = transportConfig?.transport;
    this.#prefix = transportConfig?.prefix;
    this.#definition = definition;
    this.#initRPC();
  }

  protected emit(eventInput: EventEmitterEvent<Definition, "input">) {
    // Validate the event data
    const eventDefinition = this.#definition.find((e) => e.name === eventInput.name);
    if (!eventDefinition)
      return op.failure({
        code: "Validation",
        message: `Event of type '${eventInput.name}' not defined.`,
      });
    let validatedData: unknown | undefined;
    if (eventDefinition?.dataSchema) {
      const { error, data } = eventDefinition.dataSchema.safeParse(eventInput.data);
      if (error)
        return op.failure({
          code: "Validation",
          message: `Invalid event data for '${eventInput.name}' event.`,
          cause: error,
        });
      validatedData = data;
    }

    const event = {
      id: newId("event"),
      name: eventInput.name,
      data: validatedData,
    } as EventEmitterEvent<Definition, "output">;

    for (const [listenerId, listener] of this.#listeners.entries()) {
      // If the event doesn't match the selector, ignore
      if (!this.#matchSelector(listener.selector, event)) continue;

      // If the listener is remote, emit the event via TransportClient
      if (listener.location === "remote") {
        this.#transport?.call({
          name: `${this.#prefix}.event`,
          schema: { input: z.object({ listenerId: z.string(), event: eventSchema }) },
          input: { listenerId, event },
        });
      }

      // Else, call the listener function
      else listener.callback(event);
    }
  }

  on<Selector extends EventEmitterSelector<Definition>>(
    selector: Selector,
    callback: EventEmitterCallback<Definition, Selector>,
  ) {
    const listenerId = newId("listener");
    // Set a local listener function
    this.#listeners.set(listenerId, {
      location: "local",
      selector,
      callback: callback as EventEmitterCallback<Definition, "*">,
    });
    // Set a remote listener function
    if (this.#transport) {
      this.#transport.call({
        name: `${this.#prefix}.on`,
        schema: { input: z.object({ listenerId: z.string(), selector: selectorSchema }) },
        input: { listenerId, selector: selector as never },
      });
    }
    // Return an unsubscribe function
    return () => {
      this.#listeners.delete(listenerId);
      if (this.#transport) {
        this.#transport.call({
          name: `${this.#prefix}.off`,
          schema: { input: z.object({ listenerId: z.string() }) },
          input: { listenerId },
        });
      }
    };
  }

  once<Selector extends EventEmitterSelector<Definition>>(
    selector: Selector,
    callback: EventEmitterCallback<Definition, Selector>,
  ) {
    const unsubscribe = this.on(selector, (event) => {
      unsubscribe();
      callback(event);
    });
    return unsubscribe;
  }

  #initRPC() {
    if (!this.#transport) return;
    this.#transport.register({
      name: `${this.#prefix}.on`,
      schema: { input: z.object({ listenerId: z.string(), selector: selectorSchema }) },
      execute: ({ listenerId, selector }) => {
        this.#listeners.set(listenerId, { location: "remote", selector });
        return op.success();
      },
    });
    this.#transport.register({
      name: `${this.#prefix}.off`,
      schema: { input: z.object({ listenerId: z.string() }) },
      execute: ({ listenerId }) => {
        this.#listeners.delete(listenerId);
        return op.success();
      },
    });
    this.#transport.register({
      name: `${this.#prefix}.event`,
      schema: {
        input: z.object({
          listenerId: z.string(),
          event: eventSchema,
        }),
      },
      execute: ({ listenerId, event }) => {
        const listener = this.#listeners.get(listenerId);
        if (!listener || listener.location !== "local") return op.success();
        listener.callback(event as EventEmitterEvent<Definition, "output">);
        return op.success();
      },
    });
  }

  #matchSelector(selector: EventEmitterSelector<Definition>, event: EventEmitterEvent) {
    if (selector === "*") return true;
    if (Array.isArray(selector)) return selector.includes(event.name);
    return selector === event.name;
  }
}
