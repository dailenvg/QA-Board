import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEGACY_V1, LEGACY_V2 } from "@/test/legacy-v1";
import type { StoreState } from "./store";

/** Keys whose writes the fake storage refuses, as a full browser storage would. */
const full = new Set<string>();

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
    setItem: (key, value) => {
      if (full.has(key)) throw new DOMException("Full", "QuotaExceededError");
      items.set(key, String(value));
    },
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
const V2 = JSON.stringify(LEGACY_V2);

function savedV3() {
  return JSON.parse(localStorage.getItem("squint:v3") ?? "{}") as {
    version: number;
    projects: Array<{ source: object }>;
    comments: Array<{ id: string; pageId?: string }>;
  };
}

beforeEach(() => {
  full.clear();
  vi.stubGlobal("localStorage", fakeStorage());
  vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
  held.clear();
  blobs.put.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loading version 1 data", () => {
  it("moves inline images to the blob store, saves version 3 and drops version 1", async () => {
    blobs.put.mockResolvedValue(true);
    localStorage.setItem("squint:v1", V1);
    const { store, ready } = await freshStore();
    expect(store.getSnapshot().status).toBe("loading");
    const state = await ready;
    expect(state).toMatchObject({ status: "ready", persistent: true });
    expect(blobs.put).toHaveBeenCalledWith("image:mock", expect.any(Blob));
    expect(localStorage.getItem("squint:v1")).toBeNull();
    const saved = savedV3();
    expect(saved.version).toBe(3);
    expect(saved.projects[1]?.source).toEqual({
      kind: "pages",
      origin: "image",
      pages: [{ id: "page-1", blobKey: "image:mock", name: "checkout.png" }],
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
    expect(localStorage.getItem("squint:v3")).toBeNull();
    // The image still shows for this visit.
    expect(held.has("image:mock")).toBe(true);
  });

  it("is idempotent: once version 3 exists it's read directly", async () => {
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
    expect(localStorage.getItem("squint:v3")).not.toBeNull();
  });
});

describe("loading version 2 data", () => {
  it("saves it as version 3, images where they were, and drops version 2", async () => {
    localStorage.setItem("squint:v2", V2);
    const { store, ready } = await freshStore();
    expect(store.getSnapshot().status).toBe("loading");
    expect(await ready).toMatchObject({ status: "ready", persistent: true });
    // No image is copied: the page points at the version 2 blob.
    expect(blobs.put).not.toHaveBeenCalled();
    expect(localStorage.getItem("squint:v2")).toBeNull();
    const saved = savedV3();
    expect(saved.version).toBe(3);
    expect(saved.projects[1]?.source).toMatchObject({
      kind: "pages",
      pages: [{ id: "page-1", blobKey: "image:mock" }],
    });
    expect(saved.comments.find((comment) => comment.id === "c2")?.pageId).toBe("page-1");
  });

  it("is all or nothing: when version 3 can't be saved, version 2 stays byte-identical", async () => {
    full.add("squint:v3");
    localStorage.setItem("squint:v2", V2);
    const { store, ready } = await freshStore();
    expect(await ready).toMatchObject({ status: "ready", persistent: false });
    expect(localStorage.getItem("squint:v2")).toBe(V2);
    expect(localStorage.getItem("squint:v3")).toBeNull();
    // The visit still runs on the migrated data, unsaved; the next load tries again.
    const { renameFolder } = await import("./actions");
    expect(renameFolder("default", "Renamed").ok).toBe(true);
    const state = store.getSnapshot();
    expect(state.status === "ready" && state.data.version).toBe(3);
    expect(localStorage.getItem("squint:v2")).toBe(V2);
    full.clear();
    await (
      await freshStore()
    ).ready;
    expect(localStorage.getItem("squint:v2")).toBeNull();
    expect(savedV3().version).toBe(3);
  });

  it("is idempotent: version 2 written again by an old tab is ignored once version 3 exists", async () => {
    localStorage.setItem("squint:v2", V2);
    await (
      await freshStore()
    ).ready;
    const v3 = localStorage.getItem("squint:v3");
    localStorage.setItem("squint:v2", JSON.stringify({ ...LEGACY_V2, authorName: "Old tab" }));
    const { store } = await freshStore();
    const state = store.getSnapshot();
    expect(state).toMatchObject({ status: "ready", persistent: true });
    expect(state.status === "ready" && state.data.authorName).toBe("Ana");
    expect(localStorage.getItem("squint:v3")).toBe(v3);
  });

  it("prefers version 2 over a version 1 copy left behind, and drops both", async () => {
    localStorage.setItem("squint:v1", V1);
    localStorage.setItem("squint:v2", V2);
    expect(await (await freshStore()).ready).toMatchObject({ status: "ready", persistent: true });
    expect(blobs.put).not.toHaveBeenCalled();
    expect(localStorage.getItem("squint:v1")).toBeNull();
    expect(localStorage.getItem("squint:v2")).toBeNull();
    expect(savedV3().comments.map((comment) => comment.id)).toEqual(["c1", "c2", "c3"]);
  });
});

describe("a fresh workspace", () => {
  it("starts with no folders, so the first one is the person's own", async () => {
    const { store } = await freshStore();
    const state = store.getSnapshot();
    expect(state.status === "ready" && state.data.folders).toEqual([]);
    const { createFolder } = await import("./actions");
    const created = createFolder("Client work");
    expect(created.ok).toBe(true);
    const after = store.getSnapshot();
    expect(after.status === "ready" && after.data.folders.map((folder) => folder.name)).toEqual([
      "Client work",
    ]);
  });

  it("starts over with no folders after unreadable data", async () => {
    localStorage.setItem("squint:v3", "{not json");
    const { store } = await freshStore();
    expect(store.resetData().ok).toBe(true);
    const state = store.getSnapshot();
    expect(state.status === "ready" && state.data.folders).toEqual([]);
  });

  it("keeps a stored workspace's folders as they are", async () => {
    localStorage.setItem("squint:v2", V2);
    const { ready } = await freshStore();
    const state = await ready;
    expect(state.status === "ready" && state.data.folders.map((folder) => folder.id)).toEqual([
      "default",
    ]);
  });
});

describe("the leftover default folder", () => {
  /** What every new browser saved before fresh workspaces started with no folders. */
  const leftover = {
    version: 3,
    folders: [{ id: "default", name: "My projects", createdAt: 1_761_000_000_000, parentId: null }],
    projects: [],
    comments: [],
    snapshots: [],
    revocations: [],
    authorName: null,
  };
  const CHECK_KEY = "squint:legacy-folder-cleanup";

  function folderNames(state: StoreState): string[] | false {
    return state.status === "ready" && state.data.folders.map((folder) => folder.name);
  }

  it("is removed on load and saved that way, once", async () => {
    localStorage.setItem("squint:v3", JSON.stringify(leftover));
    const { store } = await freshStore();
    expect(folderNames(store.getSnapshot())).toEqual([]);
    expect(savedV3()).toMatchObject({ version: 3, folders: [] });
    expect(localStorage.getItem(CHECK_KEY)).not.toBeNull();
  });

  it("stays once this browser was checked", async () => {
    localStorage.setItem(CHECK_KEY, "1");
    const raw = JSON.stringify(leftover);
    localStorage.setItem("squint:v3", raw);
    const { store } = await freshStore();
    expect(folderNames(store.getSnapshot())).toEqual(["My projects"]);
    expect(localStorage.getItem("squint:v3")).toBe(raw);
  });

  it("stays for this visit when the removal can't be saved; the next load tries again", async () => {
    const raw = JSON.stringify(leftover);
    localStorage.setItem("squint:v3", raw);
    full.add("squint:v3");
    const { store } = await freshStore();
    expect(folderNames(store.getSnapshot())).toEqual(["My projects"]);
    expect(localStorage.getItem("squint:v3")).toBe(raw);
    expect(localStorage.getItem(CHECK_KEY)).toBeNull();
    full.clear();
    expect(folderNames((await freshStore()).store.getSnapshot())).toEqual([]);
  });

  it("is removed from older data as it's saved as version 3", async () => {
    localStorage.setItem("squint:v2", JSON.stringify({ ...leftover, version: 2 }));
    const { ready } = await freshStore();
    expect(folderNames(await ready)).toEqual([]);
    expect(savedV3()).toMatchObject({ version: 3, folders: [] });
    expect(localStorage.getItem("squint:v2")).toBeNull();
    expect(localStorage.getItem(CHECK_KEY)).not.toBeNull();
  });

  it("stays when it holds a project, and the check is still marked done", async () => {
    localStorage.setItem("squint:v2", V2);
    const { ready } = await freshStore();
    expect(folderNames(await ready)).toEqual(["My projects"]);
    expect(localStorage.getItem(CHECK_KEY)).not.toBeNull();
  });
});
