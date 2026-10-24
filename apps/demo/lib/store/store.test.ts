import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEGACY_V1 } from "@/test/legacy-v1";
import type { StoreState } from "./store";

/** A Storage stand-in, so the store's localStorage reads and writes can be inspected. */
function fakeStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

const blobs = { put: vi.fn<(key: string, blob: Blob) => Promise<boolean>>() };
const held = new Set<string>();

vi.mock("../blob-store/blob-store", () => ({
  putBlob: (key: string, blob: Blob) => blobs.put(key, blob),
  deleteBlobs: () => Promise.resolve(),
  holdBlob: (key: string) => void held.add(key),
  getBlob: () => Promise.resolve(null),
  listBlobs: () => Promise.resolve([]),
}));

/** A fresh store module (its state is module-level) and a wait for it to leave `loading`. */
async function freshStore() {
  vi.resetModules();
  const store = await import("./store");
  const ready = new Promise<StoreState>((resolve) => {
    const check = () => {
      const state = store.getSnapshot();
      if (state.status !== "loading") resolve(state);
    };
    store.subscribe(check);
    check();
  });
  return { store, ready };
}

const V1 = JSON.stringify(LEGACY_V1);

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeStorage());
  vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
  held.clear();
  blobs.put.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loading version 1 data", () => {
  it("moves inline images to the blob store, saves version 2 and drops version 1", async () => {
    blobs.put.mockResolvedValue(true);
    localStorage.setItem("squint:v1", V1);
    const { store, ready } = await freshStore();
    expect(store.getSnapshot().status).toBe("loading");
    const state = await ready;
    expect(state).toMatchObject({ status: "ready", persistent: true });
    expect(blobs.put).toHaveBeenCalledWith("image:mock", expect.any(Blob));
    expect(localStorage.getItem("squint:v1")).toBeNull();
    const saved = JSON.parse(localStorage.getItem("squint:v2") ?? "{}") as {
      version: number;
      projects: Array<{ source: object }>;
    };
    expect(saved.version).toBe(2);
    expect(saved.projects[1]?.source).toEqual({
      kind: "image",
      blobKey: "image:mock",
      fileName: "checkout.png",
    });
  });

  it("leaves version 1 untouched and runs unsaved when an image can't be stored", async () => {
    blobs.put.mockResolvedValue(false);
    localStorage.setItem("squint:v1", V1);
    const { ready } = await freshStore();
    const state = await ready;
    expect(state).toMatchObject({ status: "ready", persistent: false });
    expect(localStorage.getItem("squint:v1")).toBe(V1);
    expect(localStorage.getItem("squint:v2")).toBeNull();
    // The image still shows for this visit.
    expect(held.has("image:mock")).toBe(true);
  });

  it("is idempotent: once version 2 exists it's read directly", async () => {
    blobs.put.mockResolvedValue(true);
    localStorage.setItem("squint:v1", V1);
    await (
      await freshStore()
    ).ready;
    blobs.put.mockClear();
    localStorage.setItem("squint:v1", V1); // An old tab wrote version 1 again.
    const { store } = await freshStore();
    expect(store.getSnapshot()).toMatchObject({ status: "ready", persistent: true });
    expect(blobs.put).not.toHaveBeenCalled();
  });

  it("keeps working changes unsaved after a failed migration, leaving version 1 alone", async () => {
    blobs.put.mockResolvedValue(false);
    localStorage.setItem("squint:v1", V1);
    const { store, ready } = await freshStore();
    await ready;
    const { renameFolder } = await import("./actions");
    expect(renameFolder("default", "Renamed").ok).toBe(true);
    const state = store.getSnapshot();
    expect(state.status === "ready" && state.data.folders[0]?.name).toBe("Renamed");
    expect(localStorage.getItem("squint:v1")).toBe(V1);
  });

  it("starting fresh from unreadable data removes the old copy", async () => {
    localStorage.setItem("squint:v1", "{not json");
    const { store } = await freshStore();
    expect(store.getSnapshot().status).toBe("corrupt");
    expect(store.resetData().ok).toBe(true);
    expect(localStorage.getItem("squint:v1")).toBeNull();
    expect(localStorage.getItem("squint:v2")).not.toBeNull();
  });
});
