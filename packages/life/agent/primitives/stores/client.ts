import * as Y from "yjs";
import z from "zod";
import { canon, type SerializableValue } from "@/shared/canon";
import { EventEmitter } from "@/shared/event-emitter";
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

export class StoreClient<Definition extends StoreDefinition = StoreDefinition>
  extends EventEmitter<typeof emitterDefinition>
  implements StoreAccessor<Definition>
{
  readonly #transport: TransportClient;
  readonly #telemetry: TelemetryClient;
  readonly #doc: Y.Doc;
  readonly #binder: YjsBinder<Definition["value"]>;
  readonly name: string;
  readonly #ready: Promise<void>;
  #lastValue: Definition["value"] | undefined;

  constructor(params: { transport: TransportClient; name: string; telemetry: TelemetryClient }) {
    super(emitterDefinition, { transport: params.transport, prefix: `stores.${params.name}` });
    this.#transport = params.transport;
    this.#telemetry = params.telemetry;
    this.#doc = new Y.Doc();
    this.name = params.name;

    // Initialize root (empty, will be populated by server sync)
    const root = this.#doc.getMap("root");
    this.#binder = bindYjs<Definition["value"]>(root);

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

    // Sync with server immediately and store promise
    this.#ready = this.#syncWithServer();
  }

  async get(): Promise<Readonly<Definition["value"]>> {
    await this.#ready;
    return this.#binder.get().value;
  }

  async set(setter: StoreSetter<Definition["value"]>): Promise<void> {
    await this.#ready;

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
  }

  observe(
    selector: StoreObserveSelector<Definition["value"]>,
    callback: StoreObserveCallback<Definition["value"]>,
  ) {
    // Track last selected value - initialized on first change after sync
    let lastSelected: SerializableValue | undefined;

    return this.on("change", (event) => {
      const { newValue, oldValue } = event.data as {
        newValue: Definition["value"];
        oldValue: Definition["value"] | undefined;
      };
      const newSelected = selector(newValue) as SerializableValue;

      // First change after sync - just initialize lastSelected
      if (lastSelected === undefined) {
        lastSelected = newSelected;
        return;
      }

      const [err, isEqual] = canon.equal(lastSelected, newSelected);
      if (err || isEqual) return;

      lastSelected = newSelected;
      callback(newValue, oldValue as Definition["value"]);
    });
  }

  ydoc() {
    return this.#doc;
  }

  #broadcast(update: Uint8Array) {
    // Encode as base64 for transport (browser-compatible)
    const base64 = btoa(String.fromCharCode(...update));
    this.#transport.sendText(`stores.${this.name}.update`, base64);
  }

  #initRPC() {
    // Receive updates from other participants
    this.#transport.receiveText(
      `stores.${this.name}.update`,
      (base64) => {
        const binary = atob(base64);
        const update = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) update[i] = binary.charCodeAt(i);
        Y.applyUpdate(this.#doc, update);
      },
      (error) => {
        console.error("Store sync error:", error);
      },
    );

    // Sync with server on connection
    this.#transport.on("connected", async () => await this.#syncWithServer());
  }

  async #syncWithServer() {
    const stateVector = Y.encodeStateVector(this.#doc);
    const base64StateVector = btoa(String.fromCharCode(...stateVector));

    const [error, data] = await this.#transport.call({
      name: `stores.${this.name}.sync`,
      schema: {
        input: z.object({ stateVector: z.string() }),
        output: z.object({ update: z.string() }),
      },
      input: { stateVector: base64StateVector },
    });

    if (error) {
      console.error("Failed to sync with server:", error);
      return;
    }

    const binary = atob(data.update);
    const update = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) update[i] = binary.charCodeAt(i);
    Y.applyUpdate(this.#doc, update);
  }
}
