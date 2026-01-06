import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { bindYjs, type Snapshot } from "./yjs-binder";

describe("bindYjs", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Basic Operations
  // ─────────────────────────────────────────────────────────────────────────

  it("should get initial snapshot", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    root.set("count", 0);
    root.set("name", "test");

    const binder = bindYjs<{ count: number; name: string }>(root);

    expect(binder.get()).toEqual({ count: 0, name: "test" });
  });

  it("should update with Immer-style mutations", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    root.set("count", 0);

    const binder = bindYjs<{ count: number }>(root);

    binder.update((draft) => {
      draft.count = 42;
    });

    expect(binder.get()).toEqual({ count: 42 });
  });

  it("should handle nested updates", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const nested = new Y.Map();
    nested.set("value", 1);
    root.set("nested", nested);

    const binder = bindYjs<{ nested: { value: number } }>(root);

    binder.update((draft) => {
      draft.nested.value = 99;
    });

    expect(binder.get()).toEqual({ nested: { value: 99 } });
  });

  it("should add new keys to objects", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    root.set("existing", 1);

    const binder = bindYjs<{ existing: number; newKey?: string }>(root);

    binder.update((draft) => {
      draft.newKey = "added";
    });

    expect(binder.get()).toEqual({ existing: 1, newKey: "added" });
  });

  it("should delete keys from objects", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    root.set("keep", 1);
    root.set("remove", 2);

    const binder = bindYjs<{ keep: number; remove?: number }>(root);

    binder.update((draft) => {
      delete draft.remove;
    });

    expect(binder.get()).toEqual({ keep: 1 });
    expect("remove" in binder.get()).toBe(false);
  });

  it("should handle deeply nested updates", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const level1 = new Y.Map();
    const level2 = new Y.Map();
    const level3 = new Y.Map();
    level3.set("deep", "original");
    level2.set("level3", level3);
    level1.set("level2", level2);
    root.set("level1", level1);

    const binder = bindYjs<{ level1: { level2: { level3: { deep: string } } } }>(root);

    binder.update((draft) => {
      draft.level1.level2.level3.deep = "modified";
    });

    expect(binder.get().level1.level2.level3.deep).toBe("modified");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Array Operations
  // ─────────────────────────────────────────────────────────────────────────

  it("should handle array push", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const items = new Y.Array();
    items.push(["a", "b"]);
    root.set("items", items);

    const binder = bindYjs<{ items: string[] }>(root);

    binder.update((draft) => {
      draft.items.push("c");
    });

    expect(binder.get().items).toEqual(["a", "b", "c"]);
  });

  it("should handle array pop", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const items = new Y.Array();
    items.push([1, 2, 3]);
    root.set("items", items);

    const binder = bindYjs<{ items: number[] }>(root);

    binder.update((draft) => {
      draft.items.pop();
    });

    expect(binder.get().items).toEqual([1, 2]);
  });

  it("should handle array unshift", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const items = new Y.Array();
    items.push([2, 3]);
    root.set("items", items);

    const binder = bindYjs<{ items: number[] }>(root);

    binder.update((draft) => {
      draft.items.unshift(1);
    });

    expect(binder.get().items).toEqual([1, 2, 3]);
  });

  it("should handle array index assignment", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const items = new Y.Array();
    items.push(["a", "b", "c"]);
    root.set("items", items);

    const binder = bindYjs<{ items: string[] }>(root);

    binder.update((draft) => {
      draft.items[1] = "replaced";
    });

    expect(binder.get().items).toEqual(["a", "replaced", "c"]);
  });

  it("should handle array splice", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const items = new Y.Array();
    items.push([1, 2, 3, 4, 5]);
    root.set("items", items);

    const binder = bindYjs<{ items: number[] }>(root);

    binder.update((draft) => {
      draft.items.splice(1, 2, 99);
    });

    expect(binder.get().items).toEqual([1, 99, 4, 5]);
  });

  it("should handle array length truncation", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const items = new Y.Array();
    items.push([1, 2, 3, 4, 5]);
    root.set("items", items);

    const binder = bindYjs<{ items: number[] }>(root);

    binder.update((draft) => {
      draft.items.length = 2;
    });

    expect(binder.get().items).toEqual([1, 2]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Subscription
  // ─────────────────────────────────────────────────────────────────────────

  it("should notify subscribers on update", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    root.set("value", 0);

    const binder = bindYjs<{ value: number }>(root);
    const snapshots: Snapshot[] = [];

    binder.subscribe((snapshot) => snapshots.push(snapshot));

    binder.update((draft) => {
      draft.value = 1;
    });
    binder.update((draft) => {
      draft.value = 2;
    });

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toEqual({ value: 1 });
    expect(snapshots[1]).toEqual({ value: 2 });
  });

  it("should unsubscribe correctly", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    root.set("value", 0);

    const binder = bindYjs<{ value: number }>(root);
    let callCount = 0;

    const unsubscribe = binder.subscribe(() => {
      callCount++;
    });

    binder.update((draft) => {
      draft.value = 1;
    });
    unsubscribe();
    binder.update((draft) => {
      draft.value = 2;
    });

    expect(callCount).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Canon Serialization (Special Types)
  // ─────────────────────────────────────────────────────────────────────────

  it("should serialize and deserialize Date", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");

    const binder = bindYjs<{ createdAt: Date | null }>(root);

    const date = new Date("2024-01-15T12:00:00.000Z");
    binder.update((draft) => {
      draft.createdAt = date;
    });

    const snapshot = binder.get();
    expect(snapshot.createdAt).toBeInstanceOf(Date);
    expect(snapshot.createdAt?.toISOString()).toBe("2024-01-15T12:00:00.000Z");
  });

  it("should serialize and deserialize BigInt", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");

    const binder = bindYjs<{ bigValue: bigint | null }>(root);

    binder.update((draft) => {
      draft.bigValue = 9007199254740993n;
    });

    const snapshot = binder.get();
    expect(snapshot.bigValue).toBe(9007199254740993n);
  });

  it("should serialize and deserialize Set", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");

    const binder = bindYjs<{ tags: Set<string> | null }>(root);

    binder.update((draft) => {
      draft.tags = new Set(["a", "b", "c"]);
    });

    const snapshot = binder.get();
    expect(snapshot.tags).toBeInstanceOf(Set);
    expect(snapshot.tags?.has("b")).toBe(true);
  });

  it("should serialize and deserialize Map", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");

    const binder = bindYjs<{ lookup: Map<string, number> | null }>(root);

    binder.update((draft) => {
      draft.lookup = new Map([
        ["x", 1],
        ["y", 2],
      ]);
    });

    const snapshot = binder.get();
    expect(snapshot.lookup).toBeInstanceOf(Map);
    expect(snapshot.lookup?.get("y")).toBe(2);
  });

  it("should serialize and deserialize Error", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");

    const binder = bindYjs<{ error: Error | null }>(root);

    binder.update((draft) => {
      draft.error = new Error("Something went wrong");
    });

    const snapshot = binder.get();
    expect(snapshot.error).toBeInstanceOf(Error);
    expect(snapshot.error?.message).toBe("Something went wrong");
  });

  it("should support multiple subscribers", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    root.set("value", 0);

    const binder = bindYjs<{ value: number }>(root);
    const calls1: number[] = [];
    const calls2: number[] = [];

    binder.subscribe((snap) => calls1.push(snap.value));
    binder.subscribe((snap) => calls2.push(snap.value));

    binder.update((draft) => {
      draft.value = 1;
    });

    expect(calls1).toEqual([1]);
    expect(calls2).toEqual([1]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // External Yjs Changes
  // ─────────────────────────────────────────────────────────────────────────

  it("should update snapshot when Yjs is modified externally", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    root.set("value", 0);

    const binder = bindYjs<{ value: number }>(root);
    expect(binder.get().value).toBe(0);

    // Modify Yjs directly (simulating external/remote change)
    root.set("value", 999);

    expect(binder.get().value).toBe(999);
  });

  it("should notify subscribers on external Yjs changes", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    root.set("value", 0);

    const binder = bindYjs<{ value: number }>(root);
    const snapshots: number[] = [];

    binder.subscribe((snap) => snapshots.push(snap.value));

    // External change
    root.set("value", 42);

    expect(snapshots).toEqual([42]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Surgical Updates (Yjs structure preservation)
  // ─────────────────────────────────────────────────────────────────────────

  it("should preserve Yjs Y.Map instances on partial updates", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const nested = new Y.Map();
    nested.set("a", 1);
    nested.set("b", 2);
    root.set("nested", nested);

    const binder = bindYjs<{ nested: { a: number; b: number } }>(root);

    // Get reference to nested Y.Map before update
    const nestedBefore = root.get("nested") as Y.Map<unknown>;

    binder.update((draft) => {
      draft.nested.a = 99;
    });

    // Nested Y.Map should be the same instance (surgical update, not replaced)
    const nestedAfter = root.get("nested") as Y.Map<unknown>;
    expect(nestedAfter).toBe(nestedBefore);

    // Verify values via binder snapshot (deserialized)
    const snapshot = binder.get();
    expect(snapshot.nested.a).toBe(99);
    expect(snapshot.nested.b).toBe(2);
  });

  it("should preserve Yjs Y.Array instances on partial updates", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const items = new Y.Array();
    items.push([1, 2, 3]);
    root.set("items", items);

    const binder = bindYjs<{ items: number[] }>(root);

    const arrayBefore = root.get("items") as Y.Array<unknown>;

    binder.update((draft) => {
      draft.items.push(4);
    });

    // Y.Array should be the same instance (surgical update)
    const arrayAfter = root.get("items") as Y.Array<unknown>;
    expect(arrayAfter).toBe(arrayBefore);

    // Verify values via binder snapshot (deserialized)
    expect(binder.get().items).toEqual([1, 2, 3, 4]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Structural Sharing
  // ─────────────────────────────────────────────────────────────────────────

  it("should maintain structural sharing for unchanged parts", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const a = new Y.Map();
    a.set("value", 1);
    const b = new Y.Map();
    b.set("value", 2);
    root.set("a", a);
    root.set("b", b);

    const binder = bindYjs<{ a: { value: number }; b: { value: number } }>(root);

    const before = binder.get();
    binder.update((draft) => {
      draft.a.value = 99;
    });
    const after = binder.get();

    // a changed, b didn't - structural sharing should preserve b reference
    expect(before.b).toBe(after.b);
    expect(before.a).not.toBe(after.a);
  });

  it("should maintain structural sharing in arrays", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const items = new Y.Array();
    const obj1 = new Y.Map();
    obj1.set("id", 1);
    const obj2 = new Y.Map();
    obj2.set("id", 2);
    items.push([obj1, obj2]);
    root.set("items", items);

    const binder = bindYjs<{ items: Array<{ id: number }> }>(root);

    const before = binder.get();
    binder.update((draft) => {
      const item = draft.items[0];
      if (item) item.id = 99;
    });
    const after = binder.get();

    // items[1] unchanged - should be same reference
    expect(before.items[1]).toBe(after.items[1]);
    expect(before.items[0]).not.toBe(after.items[0]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Sync Between Documents
  // ─────────────────────────────────────────────────────────────────────────

  it("should sync changes between two documents", () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    // Setup sync first (bidirectional)
    doc1.on("update", (update: Uint8Array) => Y.applyUpdate(doc2, update));
    doc2.on("update", (update: Uint8Array) => Y.applyUpdate(doc1, update));

    // Setup doc1 with initial state
    const root1 = doc1.getMap("root");
    root1.set("count", 0);
    const binder1 = bindYjs<{ count: number }>(root1);

    // Setup doc2 binder (state synced from doc1)
    const root2 = doc2.getMap("root");
    const binder2 = bindYjs<{ count: number }>(root2);

    // Verify initial sync
    expect(binder2.get().count).toBe(0);

    // Update doc1
    binder1.update((draft) => {
      draft.count = 42;
    });

    // doc2 should have the update
    expect(binder2.get().count).toBe(42);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────

  it("should cleanup on unbind", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    root.set("value", 0);

    const binder = bindYjs<{ value: number }>(root);
    let callCount = 0;

    binder.subscribe(() => {
      callCount++;
    });

    binder.unbind();

    // Direct Yjs mutation should not trigger subscriber after unbind
    root.set("value", 999);

    expect(callCount).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Edge Cases
  // ─────────────────────────────────────────────────────────────────────────

  it("should support Y.Array as root", () => {
    const doc = new Y.Doc();
    const root = doc.getArray<unknown>("items");
    root.push([1, 2, 3]);

    const binder = bindYjs<number[]>(root);

    expect(binder.get()).toEqual([1, 2, 3]);

    binder.update((draft) => {
      draft.push(4);
    });

    expect(binder.get()).toEqual([1, 2, 3, 4]);
  });

  it("should handle root-level replace for objects", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    root.set("a", 1);
    root.set("b", 2);

    const binder = bindYjs<{ a?: number; b?: number; c?: number }>(root);

    binder.update(() => ({ c: 3 }));

    // Root replace should clear old keys and set new ones
    const snapshot = binder.get();
    expect(snapshot).toEqual({ c: 3 });
    expect("a" in snapshot).toBe(false);
  });

  it("should handle root-level replace for arrays", () => {
    const doc = new Y.Doc();
    const root = doc.getArray<unknown>("items");
    root.push([1, 2, 3, 4, 5]);

    const binder = bindYjs<number[]>(root);

    binder.update(() => [10, 20]);

    expect(binder.get()).toEqual([10, 20]);
  });

  it("should handle empty objects", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");

    const binder = bindYjs<{ data?: Record<string, number> }>(root);

    binder.update((draft) => {
      draft.data = {};
    });

    expect(binder.get().data).toEqual({});
  });

  it("should handle empty arrays", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");

    const binder = bindYjs<{ items?: number[] }>(root);

    binder.update((draft) => {
      draft.items = [];
    });

    expect(binder.get().items).toEqual([]);
  });

  it("should handle nested arrays", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");

    const binder = bindYjs<{ matrix?: number[][] }>(root);

    binder.update((draft) => {
      draft.matrix = [
        [1, 2, 3],
        [4, 5, 6],
      ];
    });

    expect(binder.get().matrix).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);

    binder.update((draft) => {
      const row = draft.matrix?.[0];
      if (row) row[1] = 99;
    });

    expect(binder.get().matrix?.[0]).toEqual([1, 99, 3]);
  });

  it("should handle special types in nested structures", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");

    interface Event {
      name: string;
      date: Date;
      tags: Set<string>;
    }

    const binder = bindYjs<{ events?: Event[] }>(root);

    const eventDate = new Date("2024-06-15T10:00:00.000Z");
    binder.update((draft) => {
      draft.events = [
        {
          name: "Launch",
          date: eventDate,
          tags: new Set(["important", "milestone"]),
        },
      ];
    });

    const snapshot = binder.get();
    const event = snapshot.events?.[0];
    expect(event?.name).toBe("Launch");
    expect(event?.date).toBeInstanceOf(Date);
    expect(event?.date?.toISOString()).toBe("2024-06-15T10:00:00.000Z");
    expect(event?.tags).toBeInstanceOf(Set);
    expect(event?.tags?.has("important")).toBe(true);
  });

  it("should pass origin to Yjs transactions", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    root.set("value", 0);

    const binder = bindYjs<{ value: number }>(root);
    const origins: unknown[] = [];

    doc.on("update", (_update: Uint8Array, origin: unknown) => {
      origins.push(origin);
    });

    binder.update((draft) => {
      draft.value = 1;
    }, "my-origin");

    expect(origins).toContain("my-origin");
  });

  it("should handle boolean and null values", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");

    const binder = bindYjs<{ active?: boolean; data?: null }>(root);

    binder.update((draft) => {
      draft.active = false;
      draft.data = null;
    });

    const snapshot = binder.get();
    expect(snapshot.active).toBe(false);
    expect(snapshot.data).toBe(null);
  });

  it("should handle RegExp serialization", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");

    const binder = bindYjs<{ pattern?: RegExp }>(root);

    binder.update((draft) => {
      draft.pattern = /test-\d+/gi;
    });

    const snapshot = binder.get();
    expect(snapshot.pattern).toBeInstanceOf(RegExp);
    expect(snapshot.pattern?.source).toBe("test-\\d+");
    expect(snapshot.pattern?.flags).toBe("gi");
  });

  it("should handle URL serialization", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");

    const binder = bindYjs<{ url?: URL }>(root);

    binder.update((draft) => {
      draft.url = new URL("https://example.com/path?query=1");
    });

    const snapshot = binder.get();
    expect(snapshot.url).toBeInstanceOf(URL);
    expect(snapshot.url?.href).toBe("https://example.com/path?query=1");
  });

  it("should handle undefined values correctly", () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    root.set("defined", "exists");

    const binder = bindYjs<{ defined?: string; missing?: string }>(root);

    expect(binder.get().defined).toBe("exists");
    expect(binder.get().missing).toBeUndefined();

    binder.update((draft) => {
      draft.defined = undefined;
    });

    // Setting to undefined should serialize it (not delete the key)
    const snapshot = binder.get();
    expect(snapshot.defined).toBeUndefined();
  });
});
