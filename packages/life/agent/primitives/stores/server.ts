import * as Y from "yjs";
import z from "zod";
import { canon, type SerializableValue } from "@/shared/canon";
import { EventEmitter } from "@/shared/event-emitter";
import * as op from "@/shared/operation";
import type { TelemetryClient } from "@/telemetry/clients/base";
import type { TransportClient } from "@/transport/types";
import { emitterDefinition } from "./emitter";
import { bindYjs, type YjsBinder } from "./lib/yjs-binder";
import type {
  StoreAccessor,
  StoreDefinition,
  StoreObserveCallback,
  StoreObserveSelector,
  StoreSetter,
} from "./types";

export class StoreServer<Definition extends StoreDefinition = StoreDefinition> extends EventEmitter<
  typeof emitterDefinition
> {
  readonly #transport: TransportClient;
  readonly #telemetry: TelemetryClient;
  readonly #definition: Definition;
  readonly #doc: Y.Doc;
  readonly #binder: YjsBinder<Definition["value"]>;
  #lastValue: Definition["value"];

  constructor(params: {
    transport: TransportClient;
    definition: Definition;
    telemetry: TelemetryClient;
  }) {
    super(emitterDefinition, {
      transport: params.transport,
      prefix: `stores.${params.definition.name}`,
    });
    this.#transport = params.transport;
    this.#telemetry = params.telemetry;
    this.#definition = params.definition;
    this.#doc = new Y.Doc();

    // Initialize root
    const root = this.#doc.getMap("root");
    this.#binder = bindYjs<Definition["value"]>(root);
    this.#binder.update((draft) => {
      draft.value = params.definition.value as never;
    }, "init");
    this.#lastValue = this.#binder.get().value;

    // Subscribe to binder changes for event emission
    this.#binder.subscribe((snapshot) => {
      const newValue = snapshot.value;
      const oldValue = this.#lastValue;
      this.#lastValue = newValue;
      this.emit({ name: "change", data: { newValue, oldValue } });
    });

    // Broadcast local changes
    this.#doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === "local") this.#broadcast(update);
    });

    this.#initRPC();
  }

  getAccessor(): StoreAccessor<Definition> {
    return {
      get: () => this.#get(),
      set: (setter) => this.#set(setter),
      observe: (selector, callback) => this.#observe(selector, callback),
      ydoc: () => this.#doc,
      on: this.on,
      once: this.once,
    };
  }

  async #get(): Promise<Readonly<Definition["value"]>> {
    return await this.#binder.get().value;
  }

  async #set(setter: StoreSetter<Definition["value"]>): Promise<void> {
    // Immer-style: user mutates draft.value or returns new value
    if (setter instanceof Function) {
      this.#binder.update((draft) => {
        const result = setter(draft.value);
        if (result !== undefined) draft.value = result as never;
      }, "local");
    }

    // Direct value replacement
    else {
      this.#binder.update((draft) => {
        draft.value = setter as never;
      }, "local");
    }

    await void 0;
  }

  #observe(
    selector: StoreObserveSelector<Definition["value"]>,
    callback: StoreObserveCallback<Definition["value"]>,
  ) {
    let lastSelected = selector(this.#get()) as SerializableValue;

    return this.on("change", (event) => {
      const { newValue, oldValue } = event.data as {
        newValue: Definition["value"];
        oldValue: Definition["value"];
      };
      const newSelected = selector(newValue) as SerializableValue;
      const [err, isEqual] = canon.equal(lastSelected, newSelected);
      if (err || isEqual) return;

      lastSelected = newSelected;
      callback(newValue, oldValue);
    });
  }

  #broadcast(update: Uint8Array) {
    // Encode as base64 for transport
    const base64 = Buffer.from(update).toString("base64");
    this.#transport.sendText(`stores.${this.#definition.name}.update`, base64);
  }

  #initRPC() {
    const prefix = `stores.${this.#definition.name}`;

    // Receive updates from other participants
    this.#transport.receiveText(
      `${prefix}.update`,
      (base64) => {
        const update = Buffer.from(base64, "base64");
        Y.applyUpdate(this.#doc, update);
      },
      (error) => {
        this.#telemetry.log.error({ message: "Store sync error", error });
      },
    );

    // Handle sync requests from clients (for reconnection)
    this.#transport.register({
      name: `${prefix}.sync`,
      schema: {
        input: z.object({ stateVector: z.string() }),
        output: z.object({ update: z.string() }),
      },
      execute: ({ stateVector }) => {
        const clientStateVector = Buffer.from(stateVector, "base64");
        const update = Y.encodeStateAsUpdate(this.#doc, clientStateVector);
        return op.success({ update: Buffer.from(update).toString("base64") });
      },
    });
  }
}
