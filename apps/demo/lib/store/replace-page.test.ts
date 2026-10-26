import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SquintData } from "./types";

/** Keys whose writes the fake storage refuses, as a full browser storage would. */
const full = new Set<string>();

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

const stored = new Map<string, Blob>();

vi.mock("../blob-store/blob-store", () => ({
  putBlob: (key: string, blob: Blob) => {
    stored.set(key, blob);
    return Promise.resolve(true);
  },
  deleteBlobs: (keys: readonly string[]) => {
    for (const key of keys) stored.delete(key);
    return Promise.resolve();
  },
  holdBlob: () => {},
  getBlob: (key: string) => Promise.resolve(stored.get(key) ?? null),
  listBlobs: () => Promise.resolve([]),
}));

const OLD = new Blob(["old picture"]);

const DATA: SquintData = {
  version: 3,
  folders: [{ id: "default", name: "My projects", createdAt: 1, parentId: null }],
  projects: [
    {
      id: "p1",
      folderId: "default",
      name: "Mockups",
      source: {
        kind: "pages",
        origin: "image",
        pages: [
          { id: "a", blobKey: "page:a", name: "home.png", width: 800, height: 600 },
          { id: "b", blobKey: "page:b", name: "about.png", width: 800, height: 600 },
        ],
        fileName: "home.png",
      },
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  comments: [],
  snapshots: [],
  revocations: [],
  authorName: null,
};

const replacement = {
  blob: new Blob(["new picture"]),
  fileName: "about-v2.png",
  width: 1000,
  height: 700,
};

async function loaded() {
  vi.resetModules();
  const store = await import("./store");
  const actions = await import("./actions");
  const page = () => {
    const state = store.getSnapshot();
    const project = state.status === "ready" ? state.data.projects[0] : undefined;
    return project?.source.kind === "pages" ? project.source.pages[1] : undefined;
  };
  return { actions, page };
}

beforeEach(() => {
  full.clear();
  stored.clear();
  stored.set("page:b", OLD);
  vi.stubGlobal("localStorage", fakeStorage());
  vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
  localStorage.setItem("squint:v3", JSON.stringify(DATA));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("replacing a page's picture", () => {
  it("stores it under a new key with its size and next revision, leaving the old one alone", async () => {
    const { actions, page } = await loaded();
    const result = await actions.replaceWithImage("p1", replacement, {
      referenceUrl: undefined,
      pageId: "b",
    });
    expect(result.ok).toBe(true);
    const after = page();
    expect(after).toMatchObject({ name: "about-v2.png", width: 1000, height: 700, rev: 1 });
    expect(after?.blobKey).not.toBe("page:b");
    expect(stored.get(after?.blobKey ?? "")).toBe(replacement.blob);
    // The old picture isn't overwritten; the blob sweep removes it later.
    expect(stored.get("page:b")).toBe(OLD);
  });

  it("is all or nothing: when the project can't be saved, the page and its picture stay as they were", async () => {
    const { actions, page } = await loaded();
    full.add("squint:v3");
    const result = await actions.replaceWithImage("p1", replacement, {
      referenceUrl: undefined,
      pageId: "b",
    });
    expect(result.ok).toBe(false);
    expect(page()).toEqual(
      DATA.projects[0]?.source.kind === "pages" ? DATA.projects[0].source.pages[1] : null,
    );
    expect(stored.get("page:b")).toBe(OLD);
    // The new picture went again, so nothing is left behind.
    expect([...stored.keys()]).toEqual(["page:b"]);
  });
});
