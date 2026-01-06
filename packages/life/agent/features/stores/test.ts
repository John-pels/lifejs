import { castDraft } from "immer";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { MockTransportClient } from "@/transport/client/mock";
import { StoreClient } from "./client";
import { defineStore } from "./define";
import { bindYjs } from "./lib/yjs-binder";
import { StoreServer } from "./server";
import type { StoreSetter } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Create a mock telemetry client for testing */
function createMockTelemetry(): TelemetryClient {
  return {
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    },
  } as unknown as TelemetryClient;
}

/** Create connected transport clients for server-client testing */
function createConnectedTransports() {
  const serverTransport = new MockTransportClient("server");
  const clientTransport = new MockTransportClient("client");
  serverTransport.addPeer(clientTransport);
  clientTransport.addPeer(serverTransport);
  return { serverTransport, clientTransport };
}

/** Wait for async transport operations to complete */
async function waitForSync(ms = 50) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// defineStore Builder
// ─────────────────────────────────────────────────────────────────────────────

describe("defineStore", () => {
  it("should create a store definition with name", () => {
    const store = defineStore("counter");
    expect(store.definition.name).toBe("counter");
  });

  it("should set initial value", () => {
    const store = defineStore("counter").value(0);
    expect(store.definition.value).toBe(0);
  });

  it("should widen literal types to base types", () => {
    // This is a compile-time check: value(0) should infer `number`, not `0`
    const numStore = defineStore("num").value(0);
    const strStore = defineStore("str").value("hello");
    const boolStore = defineStore("bool").value(true);

    // Runtime verification that values are preserved
    expect(numStore.definition.value).toBe(0);
    expect(strStore.definition.value).toBe("hello");
    expect(boolStore.definition.value).toBe(true);
  });

  it("should support complex initial values", () => {
    const store = defineStore("user").value({
      name: "Alice",
      age: 30,
      tags: ["admin"],
    });

    expect(store.definition.value).toEqual({
      name: "Alice",
      age: 30,
      tags: ["admin"],
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// StoreRoot Wrapper Pattern
// ─────────────────────────────────────────────────────────────────────────────

describe("StoreRoot wrapper", () => {
  it("should wrap primitive values under 'value' key", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<number>(root);

    binder.update((draft) => {
      draft.value = 42;
    });

    expect(binder.get()).toEqual({ value: 42 });
    expect(binder.get().value).toBe(42);
  });

  it("should wrap objects under 'value' key", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ count: number; name: string }>(root);

    binder.update((draft) => {
      draft.value = { count: 10, name: "test" };
    });

    expect(binder.get().value).toEqual({ count: 10, name: "test" });
  });

  it("should wrap arrays under 'value' key", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<string[]>(root);

    binder.update((draft) => {
      draft.value = ["a", "b", "c"];
    });

    expect(binder.get().value).toEqual(["a", "b", "c"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Set Semantics: Immer-style Mutation vs Full Replacement
// ─────────────────────────────────────────────────────────────────────────────

describe("set() semantics", () => {
  // Helper to simulate store.set() behavior
  function storeSet<T>(binder: ReturnType<typeof bindYjs<T>>, setter: StoreSetter<T>) {
    if (setter instanceof Function) {
      binder.update((draft) => {
        const result = setter(draft.value as never);
        if (result !== undefined) draft.value = result as never;
      }, "local");
    } else {
      binder.update((draft) => {
        draft.value = setter as never;
      }, "local");
    }
  }

  describe("Immer-style mutation (in-place)", () => {
    it("should mutate nested properties", () => {
      const doc = new Y.Doc();
      const root = doc.getMap("root");
      const binder = bindYjs<{ user: { name: string; score: number } }>(root);

      binder.update((draft) => {
        draft.value = { user: { name: "Alice", score: 0 } };
      });

      storeSet(binder, (draft) => {
        draft.user.score = 100;
      });

      expect(binder.get().value.user.score).toBe(100);
      expect(binder.get().value.user.name).toBe("Alice");
    });

    it("should push to arrays", () => {
      const doc = new Y.Doc();
      const root = doc.getMap("root");
      const binder = bindYjs<{ items: string[] }>(root);

      binder.update((draft) => {
        draft.value = { items: ["a", "b"] };
      });

      storeSet(binder, (draft) => {
        draft.items.push("c");
      });

      expect(binder.get().value.items).toEqual(["a", "b", "c"]);
    });

    it("should splice arrays", () => {
      const doc = new Y.Doc();
      const root = doc.getMap("root");
      const binder = bindYjs<number[]>(root);

      binder.update((draft) => {
        draft.value = [1, 2, 3, 4, 5];
      });

      storeSet(binder, (draft) => {
        draft.splice(1, 2, 99);
      });

      expect(binder.get().value).toEqual([1, 99, 4, 5]);
    });

    it("should delete object keys", () => {
      const doc = new Y.Doc();
      const root = doc.getMap("root");
      const binder = bindYjs<{ a: number; b?: number }>(root);

      binder.update((draft) => {
        draft.value = { a: 1, b: 2 };
      });

      storeSet(binder, (draft) => {
        // biome-ignore lint/performance/noDelete: test
        delete draft.b;
      });

      expect(binder.get().value).toEqual({ a: 1 });
      expect("b" in binder.get().value).toBe(false);
    });

    it("should not trigger full replacement when returning undefined", () => {
      const doc = new Y.Doc();
      const root = doc.getMap("root");
      const binder = bindYjs<{ count: number }>(root);

      binder.update((draft) => {
        draft.value = { count: 0 };
      });

      // Mutation without return (implicit undefined)
      storeSet(binder, (draft) => {
        draft.count++;
      });

      expect(binder.get().value.count).toBe(1);
    });
  });

  describe("Full replacement (return new value)", () => {
    it("should replace primitive value", () => {
      const doc = new Y.Doc();
      const root = doc.getMap("root");
      const binder = bindYjs<number>(root);

      binder.update((draft) => {
        draft.value = 0;
      });

      storeSet(binder, () => 42);

      expect(binder.get().value).toBe(42);
    });

    it("should replace entire object", () => {
      const doc = new Y.Doc();
      const root = doc.getMap("root");
      const binder = bindYjs<{ a: number; b: number }>(root);

      binder.update((draft) => {
        draft.value = { a: 1, b: 2 };
      });

      storeSet(binder, () => ({ a: 99, b: 99 }));

      expect(binder.get().value).toEqual({ a: 99, b: 99 });
    });

    it("should replace entire array", () => {
      const doc = new Y.Doc();
      const root = doc.getMap("root");
      const binder = bindYjs<number[]>(root);

      binder.update((draft) => {
        draft.value = [1, 2, 3];
      });

      storeSet(binder, () => [10, 20]);

      expect(binder.get().value).toEqual([10, 20]);
    });

    it("should change value type via replacement", () => {
      const doc = new Y.Doc();
      const root = doc.getMap("root");
      const binder = bindYjs<{ items: number[] } | null>(root);

      binder.update((draft) => {
        draft.value = { items: [1, 2, 3] };
      });

      storeSet(binder, () => null);

      expect(binder.get().value).toBe(null);
    });
  });

  describe("Direct value setter (non-function)", () => {
    it("should replace with direct primitive", () => {
      const doc = new Y.Doc();
      const root = doc.getMap("root");
      const binder = bindYjs<number>(root);

      binder.update((draft) => {
        draft.value = 0;
      });

      storeSet(binder, 100);

      expect(binder.get().value).toBe(100);
    });

    it("should replace with direct object", () => {
      const doc = new Y.Doc();
      const root = doc.getMap("root");
      const binder = bindYjs<{ x: number }>(root);

      binder.update((draft) => {
        draft.value = { x: 0 };
      });

      storeSet(binder, { x: 999 });

      expect(binder.get().value).toEqual({ x: 999 });
    });

    it("should replace with direct array", () => {
      const doc = new Y.Doc();
      const root = doc.getMap("root");
      const binder = bindYjs<string[]>(root);

      binder.update((draft) => {
        draft.value = ["old"];
      });

      storeSet(binder, ["new", "values"]);

      expect(binder.get().value).toEqual(["new", "values"]);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Surgical Yjs Updates (CRDT Merge Preservation)
// ─────────────────────────────────────────────────────────────────────────────

describe("surgical updates", () => {
  it("should preserve Y.Map instances on partial updates", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ nested: { a: number; b: number } }>(root);

    binder.update((draft) => {
      draft.value = { nested: { a: 1, b: 2 } };
    });

    const nestedBefore = (root.get("value") as Y.Map<unknown>).get("nested") as Y.Map<unknown>;

    binder.update((draft) => {
      draft.value.nested.a = 99;
    });

    const nestedAfter = (root.get("value") as Y.Map<unknown>).get("nested") as Y.Map<unknown>;

    // Same Y.Map instance preserved (surgical update)
    expect(nestedAfter).toBe(nestedBefore);
    expect(binder.get().value.nested).toEqual({ a: 99, b: 2 });
  });

  it("should preserve Y.Array instances on partial updates", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ items: number[] }>(root);

    binder.update((draft) => {
      draft.value = { items: [1, 2, 3] };
    });

    const arrayBefore = (root.get("value") as Y.Map<unknown>).get("items") as Y.Array<unknown>;

    binder.update((draft) => {
      draft.value.items.push(4);
    });

    const arrayAfter = (root.get("value") as Y.Map<unknown>).get("items") as Y.Array<unknown>;

    // Same Y.Array instance preserved (surgical update)
    expect(arrayAfter).toBe(arrayBefore);
    expect(binder.get().value.items).toEqual([1, 2, 3, 4]);
  });

  it("should merge concurrent changes correctly", () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    // Setup bidirectional sync
    doc1.on("update", (update: Uint8Array) => Y.applyUpdate(doc2, update));
    doc2.on("update", (update: Uint8Array) => Y.applyUpdate(doc1, update));

    const root1 = doc1.getMap("root");
    const root2 = doc2.getMap("root");

    const binder1 = bindYjs<{ a: number; b: number }>(root1);
    const binder2 = bindYjs<{ a: number; b: number }>(root2);

    // Initialize
    binder1.update((draft) => {
      draft.value = { a: 0, b: 0 };
    });

    // Concurrent updates to different keys
    binder1.update((draft) => {
      draft.value.a = 1;
    });
    binder2.update((draft) => {
      draft.value.b = 2;
    });

    // Both docs should have merged state
    expect(binder1.get().value).toEqual({ a: 1, b: 2 });
    expect(binder2.get().value).toEqual({ a: 1, b: 2 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Observe with Selectors
// ─────────────────────────────────────────────────────────────────────────────

describe("observe()", () => {
  // Helper to simulate store.observe() behavior
  function storeObserve<T>(
    binder: ReturnType<typeof bindYjs<T>>,
    selector: (state: T) => unknown,
    callback: (newState: T, oldState: T) => void,
  ) {
    let lastValue = binder.get().value;
    let lastSelected = selector(lastValue);

    return binder.subscribe((snapshot) => {
      const newValue = snapshot.value;
      const newSelected = selector(newValue);

      // Simple equality check (for testing purposes)
      if (JSON.stringify(lastSelected) !== JSON.stringify(newSelected)) {
        const oldValue = lastValue;
        lastSelected = newSelected;
        lastValue = newValue;
        callback(newValue, oldValue);
      } else {
        lastValue = newValue;
      }
    });
  }

  it("should call callback when selected value changes", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ user: { name: string; score: number } }>(root);

    binder.update((draft) => {
      draft.value = { user: { name: "Alice", score: 0 } };
    });

    const calls: number[] = [];
    storeObserve(
      binder,
      (state) => state.user.score,
      (newState) => calls.push(newState.user.score),
    );

    binder.update((draft) => {
      draft.value.user.score = 10;
    });
    binder.update((draft) => {
      draft.value.user.score = 20;
    });

    expect(calls).toEqual([10, 20]);
  });

  it("should not call callback when unrelated values change", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ a: number; b: number }>(root);

    binder.update((draft) => {
      draft.value = { a: 0, b: 0 };
    });

    const calls: number[] = [];
    storeObserve(
      binder,
      (state) => state.a,
      (newState) => calls.push(newState.a),
    );

    // Change b (unrelated to selector)
    binder.update((draft) => {
      draft.value.b = 100;
    });

    expect(calls).toEqual([]);
  });

  it("should work with nested selectors", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ config: { theme: { color: string } } }>(root);

    binder.update((draft) => {
      draft.value = { config: { theme: { color: "blue" } } };
    });

    const colors: string[] = [];
    storeObserve(
      binder,
      (state) => state.config.theme.color,
      (newState) => colors.push(newState.config.theme.color),
    );

    binder.update((draft) => {
      draft.value.config.theme.color = "red";
    });

    expect(colors).toEqual(["red"]);
  });

  it("should unsubscribe correctly", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<number>(root);

    binder.update((draft) => {
      draft.value = 0;
    });

    let callCount = 0;
    const unsubscribe = storeObserve(
      binder,
      (state) => state,
      () => callCount++,
    );

    binder.update((draft) => {
      draft.value = 1;
    });
    unsubscribe();
    binder.update((draft) => {
      draft.value = 2;
    });

    expect(callCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Special Types Serialization
// ─────────────────────────────────────────────────────────────────────────────

describe("special types", () => {
  it("should handle Date in store value", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ createdAt: Date }>(root);

    const date = new Date("2024-06-15T12:00:00.000Z");
    binder.update((draft) => {
      draft.value = { createdAt: date };
    });

    const result = binder.get().value.createdAt;
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe("2024-06-15T12:00:00.000Z");
  });

  it("should handle Set in store value", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ tags: Set<string> }>(root);

    binder.update((draft) => {
      draft.value = { tags: new Set(["a", "b", "c"]) };
    });

    const result = binder.get().value.tags;
    expect(result).toBeInstanceOf(Set);
    expect(result.has("b")).toBe(true);
    expect(result.size).toBe(3);
  });

  it("should handle Map in store value", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ lookup: Map<string, number> }>(root);

    binder.update((draft) => {
      draft.value = {
        lookup: new Map([
          ["x", 1],
          ["y", 2],
        ]),
      };
    });

    const result = binder.get().value.lookup;
    expect(result).toBeInstanceOf(Map);
    expect(result.get("y")).toBe(2);
  });

  it("should handle BigInt in store value", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ big: bigint }>(root);

    binder.update((draft) => {
      draft.value = { big: 9007199254740993n };
    });

    expect(binder.get().value.big).toBe(9007199254740993n);
  });

  it("should handle Error in store value", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ error: Error }>(root);

    binder.update((draft) => {
      draft.value = { error: new Error("Something failed") };
    });

    const result = binder.get().value.error;
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("Something failed");
  });

  it("should handle RegExp in store value", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ pattern: RegExp }>(root);

    binder.update((draft) => {
      draft.value = { pattern: /test-\d+/gi };
    });

    const result = binder.get().value.pattern;
    expect(result).toBeInstanceOf(RegExp);
    expect(result.source).toBe("test-\\d+");
    expect(result.flags).toBe("gi");
  });

  it("should handle URL in store value", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ url: URL }>(root);

    binder.update((draft) => {
      draft.value = { url: castDraft(new URL("https://example.com/path?q=1")) };
    });

    const result = binder.get().value.url;
    expect(result).toBeInstanceOf(URL);
    expect(result.href).toBe("https://example.com/path?q=1");
  });

  it("should handle mixed special types in nested structures", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");

    interface Event {
      id: bigint;
      name: string;
      date: Date;
      tags: Set<string>;
      metadata: Map<string, unknown>;
    }

    const binder = bindYjs<{ events: Event[] }>(root);

    binder.update((draft) => {
      draft.value = {
        events: [
          {
            id: 1n,
            name: "Launch",
            date: new Date("2024-01-01"),
            tags: new Set(["important"]),
            metadata: new Map([["key", "value"]]),
          },
        ],
      };
    });

    const event = binder.get().value.events[0];
    expect(event?.id).toBe(1n);
    expect(event?.date).toBeInstanceOf(Date);
    expect(event?.tags).toBeInstanceOf(Set);
    expect(event?.metadata).toBeInstanceOf(Map);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("should handle null value", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ data: string | null }>(root);

    binder.update((draft) => {
      draft.value = { data: "exists" };
    });

    binder.update((draft) => {
      draft.value.data = null;
    });

    expect(binder.get().value.data).toBe(null);
  });

  it("should handle undefined value", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ data?: string }>(root);

    binder.update((draft) => {
      draft.value = { data: "exists" };
    });

    binder.update((draft) => {
      draft.value.data = undefined;
    });

    expect(binder.get().value.data).toBeUndefined();
  });

  it("should handle empty object", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<Record<string, never>>(root);

    binder.update((draft) => {
      draft.value = {};
    });

    expect(binder.get().value).toEqual({});
  });

  it("should handle empty array", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<never[]>(root);

    binder.update((draft) => {
      draft.value = [];
    });

    expect(binder.get().value).toEqual([]);
  });

  it("should handle deeply nested structures", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ a: { b: { c: { d: { e: number } } } } }>(root);

    binder.update((draft) => {
      draft.value = { a: { b: { c: { d: { e: 42 } } } } };
    });

    expect(binder.get().value.a.b.c.d.e).toBe(42);

    binder.update((draft) => {
      draft.value.a.b.c.d.e = 99;
    });

    expect(binder.get().value.a.b.c.d.e).toBe(99);
  });

  it("should handle nested arrays", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<number[][]>(root);

    binder.update((draft) => {
      draft.value = [
        [1, 2, 3],
        [4, 5, 6],
      ];
    });

    expect(binder.get().value).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);

    binder.update((draft) => {
      const row = draft.value[0];
      if (row) row[1] = 99;
    });

    expect(binder.get().value[0]).toEqual([1, 99, 3]);
  });

  it("should handle array of objects", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ id: number; name: string }[]>(root);

    binder.update((draft) => {
      draft.value = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ];
    });

    binder.update((draft) => {
      const item = draft.value.find((i) => i.id === 2);
      if (item) item.name = "Bobby";
    });

    expect(binder.get().value[1]?.name).toBe("Bobby");
  });

  it("should handle boolean values", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ active: boolean; visible: boolean }>(root);

    binder.update((draft) => {
      draft.value = { active: true, visible: false };
    });

    expect(binder.get().value.active).toBe(true);
    expect(binder.get().value.visible).toBe(false);

    binder.update((draft) => {
      draft.value.active = false;
    });

    expect(binder.get().value.active).toBe(false);
  });

  it("should handle zero and empty string", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ num: number; str: string }>(root);

    binder.update((draft) => {
      draft.value = { num: 0, str: "" };
    });

    expect(binder.get().value.num).toBe(0);
    expect(binder.get().value.str).toBe("");
  });

  it("should handle rapid sequential updates", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<number>(root);

    binder.update((draft) => {
      draft.value = 0;
    });

    for (let i = 1; i <= 100; i++) {
      binder.update((draft) => {
        draft.value = i;
      });
    }

    expect(binder.get().value).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Origin Parameter (for filtering local vs remote changes)
// ─────────────────────────────────────────────────────────────────────────────

describe("origin parameter", () => {
  it("should pass origin to Yjs transactions", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<number>(root);
    const origins: unknown[] = [];

    doc.on("update", (_update: Uint8Array, origin: unknown) => {
      origins.push(origin);
    });

    binder.update((draft) => {
      draft.value = 1;
    }, "local");

    binder.update((draft) => {
      draft.value = 2;
    }, "remote");

    expect(origins).toContain("local");
    expect(origins).toContain("remote");
  });

  it("should allow filtering updates by origin", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<number>(root);
    const localUpdates: number[] = [];

    binder.update((draft) => {
      draft.value = 0;
    }, "init");

    doc.on("update", (_update: Uint8Array, origin: unknown) => {
      if (origin === "local") {
        localUpdates.push(binder.get().value);
      }
    });

    binder.update((draft) => {
      draft.value = 1;
    }, "local");
    binder.update((draft) => {
      draft.value = 2;
    }, "remote");
    binder.update((draft) => {
      draft.value = 3;
    }, "local");

    expect(localUpdates).toEqual([1, 3]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Structural Sharing
// ─────────────────────────────────────────────────────────────────────────────

describe("structural sharing", () => {
  it("should preserve references to unchanged parts", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ a: { val: number }; b: { val: number } }>(root);

    binder.update((draft) => {
      draft.value = { a: { val: 1 }, b: { val: 2 } };
    });

    const before = binder.get();

    binder.update((draft) => {
      draft.value.a.val = 99;
    });

    const after = binder.get();

    // b was unchanged, reference should be preserved
    expect(after.value.b).toBe(before.value.b);
    // a was changed, reference should be different
    expect(after.value.a).not.toBe(before.value.a);
  });

  it("should preserve references in arrays for unchanged items", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const binder = bindYjs<{ items: { id: number }[] }>(root);

    binder.update((draft) => {
      draft.value = { items: [{ id: 1 }, { id: 2 }, { id: 3 }] };
    });

    const before = binder.get();

    binder.update((draft) => {
      const item = draft.value.items[0];
      if (item) item.id = 99;
    });

    const after = binder.get();

    // items[1] and items[2] unchanged
    expect(after.value.items[1]).toBe(before.value.items[1]);
    expect(after.value.items[2]).toBe(before.value.items[2]);
    // items[0] changed
    expect(after.value.items[0]).not.toBe(before.value.items[0]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// StoreServer
// ─────────────────────────────────────────────────────────────────────────────

describe("StoreServer", () => {
  it("should initialize with definition value", async () => {
    const { serverTransport } = createConnectedTransports();
    await serverTransport.joinRoom();

    const definition = defineStore("counter").value(42).definition;
    const store = new StoreServer({
      transport: serverTransport,
      telemetry: createMockTelemetry(),
      definition,
    });

    expect(await store.get()).toBe(42);
  });

  it("should get and set primitive values", async () => {
    const { serverTransport } = createConnectedTransports();
    await serverTransport.joinRoom();

    const definition = defineStore("counter").value(0).definition;
    const store = new StoreServer({
      transport: serverTransport,
      telemetry: createMockTelemetry(),
      definition,
    });

    expect(await store.get()).toBe(0);

    store.set(10);
    expect(await store.get()).toBe(10);

    store.set((draft) => draft + 5);
    expect(await store.get()).toBe(15);
  });

  it("should support Immer-style mutations", async () => {
    const { serverTransport } = createConnectedTransports();
    await serverTransport.joinRoom();

    const definition = defineStore("user").value({ name: "Alice", score: 0 }).definition;
    const store = new StoreServer({
      transport: serverTransport,
      telemetry: createMockTelemetry(),
      definition,
    });

    store.set((draft) => {
      draft.score = 100;
    });

    expect(await store.get()).toEqual({ name: "Alice", score: 100 });
  });

  it("should support full value replacement", async () => {
    const { serverTransport } = createConnectedTransports();
    await serverTransport.joinRoom();

    const definition = defineStore("data").value({ x: 1, y: 2 }).definition;
    const store = new StoreServer({
      transport: serverTransport,
      telemetry: createMockTelemetry(),
      definition,
    });

    store.set(() => ({ x: 99, y: 99 }));
    expect(await store.get()).toEqual({ x: 99, y: 99 });
  });

  it("should emit change events", async () => {
    const { serverTransport } = createConnectedTransports();
    await serverTransport.joinRoom();

    const definition = defineStore("counter").value(0).definition;
    const store = new StoreServer({
      transport: serverTransport,
      telemetry: createMockTelemetry(),
      definition,
    });

    const changes: { newValue: number; oldValue: number }[] = [];
    store.on("change", (event) => {
      changes.push(event.data as { newValue: number; oldValue: number });
    });

    store.set(1);
    store.set(2);
    store.set(3);

    expect(changes).toHaveLength(3);
    expect(changes[0]).toEqual({ newValue: 1, oldValue: 0 });
    expect(changes[1]).toEqual({ newValue: 2, oldValue: 1 });
    expect(changes[2]).toEqual({ newValue: 3, oldValue: 2 });
  });

  it("should observe with selector", async () => {
    const { serverTransport } = createConnectedTransports();
    await serverTransport.joinRoom();

    const definition = defineStore("user").value({ name: "Alice", score: 0 }).definition;
    const store = new StoreServer({
      transport: serverTransport,
      telemetry: createMockTelemetry(),
      definition,
    });

    const scores: number[] = [];
    store.observe(
      (state) => state.score,
      (newState) => scores.push(newState.score),
    );

    store.set((d) => {
      d.score = 10;
    });
    store.set((d) => {
      d.name = "Bob";
    }); // Unrelated change
    store.set((d) => {
      d.score = 20;
    });

    expect(scores).toEqual([10, 20]);
  });

  it("should expose ydoc()", async () => {
    const { serverTransport } = createConnectedTransports();
    await serverTransport.joinRoom();

    const definition = defineStore("test").value(0).definition;
    const store = new StoreServer({
      transport: serverTransport,
      telemetry: createMockTelemetry(),
      definition,
    });

    expect(store.ydoc()).toBeInstanceOf(Y.Doc);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// StoreClient
// ─────────────────────────────────────────────────────────────────────────────

describe("StoreClient", () => {
  it("should sync initial value from server", async () => {
    const { serverTransport, clientTransport } = createConnectedTransports();
    await serverTransport.joinRoom();
    await clientTransport.joinRoom();

    const definition = defineStore("counter").value(42).definition;

    // Server must exist for client to sync from
    new StoreServer({
      transport: serverTransport,
      telemetry: createMockTelemetry(),
      definition,
    });

    const client = new StoreClient({
      transport: clientTransport,
      telemetry: createMockTelemetry(),
      name: "counter",
    });

    // Wait for sync to complete
    expect(await client.get()).toBe(42);
  });

  it("should get and set values (async)", async () => {
    const { serverTransport, clientTransport } = createConnectedTransports();
    await serverTransport.joinRoom();
    await clientTransport.joinRoom();

    const definition = defineStore("counter").value(0).definition;

    new StoreServer({
      transport: serverTransport,
      telemetry: createMockTelemetry(),
      definition,
    });

    const client = new StoreClient<typeof definition>({
      transport: clientTransport,
      telemetry: createMockTelemetry(),
      name: "counter",
    });

    await client.set(10);
    expect(await client.get()).toBe(10);

    await client.set((draft) => draft + 5);
    expect(await client.get()).toBe(15);
  });

  it("should emit change events after sync", async () => {
    const { serverTransport, clientTransport } = createConnectedTransports();
    await serverTransport.joinRoom();
    await clientTransport.joinRoom();

    const definition = defineStore("counter").value(0).definition;

    new StoreServer({
      transport: serverTransport,
      telemetry: createMockTelemetry(),
      definition,
    });

    const client = new StoreClient({
      transport: clientTransport,
      telemetry: createMockTelemetry(),
      name: "counter",
    });

    const changes: number[] = [];
    client.on("change", (event) => {
      const data = event.data as { newValue: number };
      changes.push(data.newValue);
    });

    // First change is from initial sync (server's value)
    await client.set(1);
    await client.set(2);

    // Changes include: initial sync (0), then 1, then 2
    expect(changes).toContain(0);
    expect(changes).toContain(1);
    expect(changes).toContain(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Server-Client Sync via Transport
// ─────────────────────────────────────────────────────────────────────────────

describe("server-client sync", () => {
  it("should sync server changes to client", async () => {
    const { serverTransport, clientTransport } = createConnectedTransports();
    await serverTransport.joinRoom();
    await clientTransport.joinRoom();

    const definition = defineStore("counter").value(0).definition;

    const server = new StoreServer({
      transport: serverTransport,
      telemetry: createMockTelemetry(),
      definition,
    });

    const client = new StoreClient({
      transport: clientTransport,
      telemetry: createMockTelemetry(),
      name: "counter",
    });
    // Server updates
    server.set(42);
    await waitForSync();

    // Client should receive the update
    expect(await client.get()).toBe(42);
  });

  it("should sync client changes to server", async () => {
    const { serverTransport, clientTransport } = createConnectedTransports();
    await serverTransport.joinRoom();
    await clientTransport.joinRoom();

    const definition = defineStore("counter").value(0).definition;

    const server = new StoreServer({
      transport: serverTransport,
      telemetry: createMockTelemetry(),
      definition,
    });

    const client = new StoreClient({
      transport: clientTransport,
      telemetry: createMockTelemetry(),
      name: "counter",
    });

    // Client updates (set awaits ready internally)
    await client.set(99);
    await waitForSync();

    // Server should receive the update
    expect(await server.get()).toBe(99);
  });

  it("should sync complex object changes", async () => {
    const { serverTransport, clientTransport } = createConnectedTransports();
    await serverTransport.joinRoom();
    await clientTransport.joinRoom();

    // biome-ignore lint/style/useConsistentTypeDefinitions: interface doesn't work with defineStore
    type UserState = {
      name: string;
      score: number;
      items: string[];
    };

    const definition = defineStore("user").value<UserState>({
      name: "Alice",
      score: 0,
      items: [],
    }).definition;

    const server = new StoreServer({
      transport: serverTransport,
      telemetry: createMockTelemetry(),
      definition,
    });

    const client = new StoreClient<typeof definition>({
      transport: clientTransport,
      telemetry: createMockTelemetry(),
      name: "user",
    });
    // Server: Immer-style mutation
    server.set((draft) => {
      draft.score = 100;
      draft.items.push("sword");
    });
    await waitForSync();

    expect(await client.get()).toEqual({
      name: "Alice",
      score: 100,
      items: ["sword"],
    });

    // Client: Immer-style mutation
    await client.set((draft) => {
      draft.name = "Alice the Great";
      draft.items.push("shield");
    });
    await waitForSync();

    expect(await server.get()).toEqual({
      name: "Alice the Great",
      score: 100,
      items: ["sword", "shield"],
    });
  });

  it("should merge concurrent changes (CRDT)", async () => {
    const { serverTransport, clientTransport } = createConnectedTransports();
    await serverTransport.joinRoom();
    await clientTransport.joinRoom();

    const definition = defineStore("state").value({ a: 0, b: 0 }).definition;

    const server = new StoreServer({
      transport: serverTransport,
      telemetry: createMockTelemetry(),
      definition,
    });

    const client = new StoreClient<typeof definition>({
      transport: clientTransport,
      telemetry: createMockTelemetry(),
      name: "state",
    });

    // Concurrent changes to different keys
    server.set((draft) => {
      draft.a = 1;
    });
    await client.set((draft) => {
      draft.b = 2;
    });

    await waitForSync();

    // Both should have merged state
    expect(await server.get()).toEqual({ a: 1, b: 2 });
    expect(await client.get()).toEqual({ a: 1, b: 2 });
  });

  it("should sync special types", async () => {
    const { serverTransport, clientTransport } = createConnectedTransports();
    await serverTransport.joinRoom();
    await clientTransport.joinRoom();

    // biome-ignore lint/style/useConsistentTypeDefinitions: interface doesn't work with defineStore
    type SpecialState = {
      date: Date | null;
      tags: Set<string> | null;
    };

    const definition = defineStore("special").value<SpecialState>({
      date: null,
      tags: null,
    }).definition;

    const server = new StoreServer({
      transport: serverTransport,
      telemetry: createMockTelemetry(),
      definition,
    });

    const client = new StoreClient<typeof definition>({
      transport: clientTransport,
      telemetry: createMockTelemetry(),
      name: "special",
    });
    // Server sets special types
    const testDate = new Date("2024-06-15T12:00:00.000Z");
    server.set({
      date: testDate,
      tags: new Set(["a", "b", "c"]),
    });
    await waitForSync();

    const clientState = await client.get();
    expect(clientState.date).toBeInstanceOf(Date);
    expect(clientState.date?.toISOString()).toBe("2024-06-15T12:00:00.000Z");
    expect(clientState.tags).toBeInstanceOf(Set);
    expect(clientState.tags?.has("b")).toBe(true);
  });

  it("should trigger change events on sync", async () => {
    const { serverTransport, clientTransport } = createConnectedTransports();
    await serverTransport.joinRoom();
    await clientTransport.joinRoom();

    const definition = defineStore("counter").value(0).definition;

    const server = new StoreServer({
      transport: serverTransport,
      telemetry: createMockTelemetry(),
      definition,
    });

    const client = new StoreClient({
      transport: clientTransport,
      telemetry: createMockTelemetry(),
      name: "counter",
    });

    const clientChanges: number[] = [];
    client.on("change", (event) => {
      const data = event.data as { newValue: number };
      clientChanges.push(data.newValue);
    });
    server.set(10);
    server.set(20);
    await waitForSync();

    expect(clientChanges).toContain(20);
  });

  it("should handle array operations across sync", async () => {
    const { serverTransport, clientTransport } = createConnectedTransports();
    await serverTransport.joinRoom();
    await clientTransport.joinRoom();

    const definition = defineStore("list").value<number[]>([]).definition;

    const server = new StoreServer({
      transport: serverTransport,
      telemetry: createMockTelemetry(),
      definition,
    });

    const client = new StoreClient<typeof definition>({
      transport: clientTransport,
      telemetry: createMockTelemetry(),
      name: "list",
    });

    // Server pushes items
    server.set((draft) => {
      draft.push(1, 2, 3);
    });
    await waitForSync();

    expect(await client.get()).toEqual([1, 2, 3]);

    // Client splices
    await client.set((draft) => {
      draft.splice(1, 1, 99);
    });
    await waitForSync();

    expect(await server.get()).toEqual([1, 99, 3]);
  });
});
