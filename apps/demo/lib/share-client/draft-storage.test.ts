import { afterEach, describe, expect, it, vi } from "vitest";
import { createDraftStorage, type StoredDraft } from "./draft-storage";

const DRAFT: StoredDraft = {
  x: 10,
  y: 20,
  body: "Half-written thought",
  surfaceKey: "snapshot:s1",
  snapshotId: "s1",
  pageId: null,
  commentId: "c1",
};

/** A sessionStorage that keeps what it's given, or refuses everything (private modes, quotas). */
function sessionStorageStub(refuse = false) {
  const items = new Map<string, string>();
  const fail = () => {
    throw new DOMException("refused", "SecurityError");
  };
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => (refuse ? fail() : (items.get(key) ?? null)),
    setItem: (key: string, value: string) => (refuse ? fail() : items.set(key, value)),
    removeItem: (key: string) => (refuse ? fail() : items.delete(key)),
  });
  return items;
}

afterEach(() => vi.unstubAllGlobals());

describe("a shared link's draft", () => {
  it("is kept in this tab's sessionStorage, per link", () => {
    const items = sessionStorageStub();
    createDraftStorage("t1").save(DRAFT);
    expect(createDraftStorage("t1").load()).toEqual(DRAFT);
    expect(createDraftStorage("t2").load()).toBeNull();
    expect([...items.keys()]).toEqual(["squint:draft:t1"]);
  });

  it("is still there in memory when sessionStorage refuses it", () => {
    sessionStorageStub(true);
    const storage = createDraftStorage("t1");
    storage.save(DRAFT);
    expect(storage.load()).toEqual(DRAFT);
    storage.save(null);
    expect(storage.load()).toBeNull();
  });

  it("is gone from both once posted or cancelled", () => {
    const items = sessionStorageStub();
    const storage = createDraftStorage("t1");
    storage.save(DRAFT);
    storage.save(null);
    expect(storage.load()).toBeNull();
    expect(items.size).toBe(0);
  });
});
