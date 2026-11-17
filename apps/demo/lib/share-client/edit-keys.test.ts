import { describe, expect, it } from "vitest";
import { editKeysName, linkEditKeys } from "./edit-keys";

const A = "a".repeat(43);
const B = "b".repeat(43);
const KEY = "k".repeat(43);

/** A Storage kept in a map, as localStorage would hold it. */
function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    storage: {
      getItem: (name: string) => items.get(name) ?? null,
      setItem: (name: string, value: string) => void items.set(name, value),
    },
  };
}

describe("linkEditKeys", () => {
  it("keeps each comment's key for its own link only", () => {
    const { storage } = memoryStorage();
    const one = linkEditKeys(A, () => storage);
    const other = linkEditKeys(B, () => storage);
    one.save("c-1", KEY);
    one.save("c-2", "z".repeat(43));
    expect(one.ids()).toEqual(["c-1", "c-2"]);
    expect(one.keyOf("c-1")).toBe(KEY);
    expect(other.ids()).toEqual([]);
    expect(other.keyOf("c-1")).toBeNull();
  });

  it("ignores anything in storage that isn't a key", () => {
    const { items, storage } = memoryStorage();
    for (const stored of ["not json", "[]", "null", JSON.stringify({ "c-1": 5, "c-2": "short" })]) {
      items.set(editKeysName(A), stored);
      expect(linkEditKeys(A, () => storage).ids(), stored).toEqual([]);
    }
  });

  it("has no keys, and loses none it can't keep, when storage is blocked", () => {
    const blocked = () => {
      throw new DOMException("denied", "SecurityError");
    };
    const keys = linkEditKeys(A, blocked);
    expect(() => keys.save("c-1", KEY)).not.toThrow();
    expect(keys.ids()).toEqual([]);
    expect(keys.keyOf("c-1")).toBeNull();
  });
});
