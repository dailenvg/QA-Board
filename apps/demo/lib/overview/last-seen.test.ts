import { describe, expect, it } from "vitest";
import {
  beginVisit,
  FIRST_VISIT_WINDOW_MS,
  readLastSeen,
  writeLastSeen,
  type LastSeenStorage,
} from "./last-seen";

const NOW = Date.UTC(2026, 10, 9, 12);
const FIRST = { since: NOW - FIRST_VISIT_WINDOW_MS, firstVisit: true };

function memoryStorage(): LastSeenStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

const BLOCKED: LastSeenStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("last seen", () => {
  it("treats the last week as new on a first visit, and remembers this one", () => {
    const storage = memoryStorage();
    expect(beginVisit("w1", NOW, storage)).toEqual(FIRST);
    expect(readLastSeen("w1", storage)).toBe(NOW);
  });

  it("returns the previous visit, then moves it on", () => {
    const storage = memoryStorage();
    writeLastSeen("w1", NOW - 3_600_000, storage);
    expect(beginVisit("w1", NOW, storage)).toEqual({ since: NOW - 3_600_000, firstVisit: false });
    expect(beginVisit("w1", NOW + 60_000, storage)).toEqual({ since: NOW, firstVisit: false });
  });

  it("keeps each workspace apart", () => {
    const storage = memoryStorage();
    writeLastSeen("w1", NOW - 1_000, storage);
    expect(beginVisit("w2", NOW, storage)).toEqual(FIRST);
    expect(readLastSeen("w1", storage)).toBe(NOW - 1_000);
  });

  it("never starts the window in the future, and ignores what it can't read", () => {
    const storage = memoryStorage();
    writeLastSeen("w1", NOW + 86_400_000, storage);
    expect(beginVisit("w1", NOW, storage)).toEqual({ since: NOW, firstVisit: false });
    for (const junk of ["", "soon", "-5", "Infinity"]) {
      storage.items.set("squint:last-seen:w1", junk);
      expect(readLastSeen("w1", storage)).toBeNull();
    }
  });

  it("works without storage: blocked, full, or on the server", () => {
    expect(readLastSeen("w1", BLOCKED)).toBeNull();
    expect(() => writeLastSeen("w1", NOW, BLOCKED)).not.toThrow();
    expect(beginVisit("w1", NOW, BLOCKED)).toEqual(FIRST);
    expect(beginVisit("w1", NOW, null)).toEqual(FIRST);
    // The default storage: none in this (Node) environment.
    expect(beginVisit("w1", NOW)).toEqual(FIRST);
  });
});
