import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEGACY_V1, LEGACY_V2 } from "@/test/legacy-v1";
import type { LocalData } from "./local-store";

const cleared = vi.hoisted(() => ({ blobs: false }));

vi.mock("../blob-store/blob-store", () => ({
  clearBlobs: () => {
    cleared.blobs = true;
    return Promise.resolve();
  },
}));

/** A Storage stand-in that records every write, which the local store must never make. */
function fakeStorage(writes: string[]): Storage {
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
      writes.push(key);
      items.set(key, String(value));
    },
  };
}

let writes: string[] = [];

beforeEach(() => {
  writes = [];
  cleared.blobs = false;
  vi.stubGlobal("localStorage", fakeStorage(writes));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Stores `entries` as an earlier build would have, then reads them. */
async function read(entries: Record<string, string>): Promise<LocalData> {
  for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  writes.length = 0;
  const { readLocalData } = await import("./local-store");
  return readLocalData();
}

const found = (data: LocalData) => {
  if (data.status !== "found") throw new Error(`expected data, got ${data.status}`);
  return data;
};

describe("reading what an earlier build left in this browser", () => {
  it("finds nothing in a fresh browser", async () => {
    expect(await read({})).toEqual({ status: "none" });
  });

  it("reads version 3 first, and never writes anything back", async () => {
    const v3 = { ...LEGACY_V2, version: 3, authorName: "Newer" };
    const data = found(
      await read({ "squint:v3": JSON.stringify(v3), "squint:v2": JSON.stringify(LEGACY_V2) }),
    );
    expect(data.data.authorName).toBe("Newer");
    expect(writes).toEqual([]);
  });

  it("upgrades version 2 in memory: pages keep pointing at their images", async () => {
    const { data } = found(await read({ "squint:v2": JSON.stringify(LEGACY_V2) }));
    expect(data.version).toBe(3);
    expect(data.projects[1]?.source).toMatchObject({
      kind: "pages",
      pages: [{ id: "page-1", blobKey: "image:mock" }],
    });
    expect(data.comments.find((comment) => comment.id === "c2")?.pageId).toBe("page-1");
  });

  it("hands back version 1's inline images, still to be uploaded", async () => {
    const { pendingImages } = found(await read({ "squint:v1": JSON.stringify(LEGACY_V1) }));
    expect(pendingImages.map((image) => image.key)).toEqual(["image:mock"]);
  });

  it("keeps unreadable data as it is, with the reason", async () => {
    expect(await read({ "squint:v3": "{not json" })).toEqual({
      status: "unreadable",
      reason: "The saved data isn't valid JSON.",
      raw: "{not json",
    });
  });

  it("doesn't count the empty folder every browser used to get", async () => {
    const leftover = {
      version: 3,
      folders: [
        { id: "default", name: "My projects", createdAt: 1_761_000_000_000, parentId: null },
      ],
      projects: [],
      comments: [],
      snapshots: [],
      authorName: null,
    };
    expect(await read({ "squint:v3": JSON.stringify(leftover) })).toEqual({ status: "none" });
  });
});

describe("clearing it", () => {
  it("removes every saved copy and the images", async () => {
    await read({
      "squint:v3": "{}",
      "squint:v2": "{}",
      "squint:v1": "{}",
      "squint:legacy-folder-cleanup": "1",
      "squint:theme": "dark",
    });
    const { clearLocalData } = await import("./local-store");
    await clearLocalData();
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem("squint:theme")).toBe("dark");
    expect(cleared.blobs).toBe(true);
  });
});
