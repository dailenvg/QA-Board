import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SquiggyEvent } from "../squiggy/events";
import type { LocalData } from "../store/local-store";
import type { ImportOutcome } from "./import-local";

const local = vi.hoisted(() => {
  const state: { data: LocalData; clears: number; outcome: ImportOutcome | null } = {
    data: { status: "none" },
    clears: 0,
    outcome: null,
  };
  return state;
});

vi.mock("../store/local-store", () => ({
  readLocalData: () => local.data,
  clearLocalData: () => {
    local.clears += 1;
    local.data = { status: "none" };
    return Promise.resolve();
  },
}));

vi.mock("./workspace-store", () => ({ refreshWorkspace: () => Promise.resolve() }));

vi.mock("./import-local", () => ({
  importLocalData: () => Promise.resolve(local.outcome),
}));

const FOUND: LocalData = {
  status: "found",
  data: {
    version: 3,
    folders: [{ id: "f", name: "F", createdAt: 1, parentId: null }],
    projects: [],
    comments: [],
    snapshots: [],
    authorName: null,
  },
  pendingImages: [],
};

function memoryStorage(): Storage {
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

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", memoryStorage());
  local.data = FOUND;
  local.clears = 0;
  local.outcome = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const load = () => import("./use-local-import");

const REPORT = { projects: 0, comments: 0, files: 0, skipped: [], cleared: false, moved: false };

describe("the import offer", () => {
  it("offers found data; Not now keeps it and holds the offer until the next sign-in", async () => {
    const store = await load();
    const deferral = await import("./import-deferral");
    store.checkLocalData();
    expect(store.getLocalImportState()).toMatchObject({ view: "offer", counts: { folders: 1 } });
    store.importLater();
    expect(store.getLocalImportState()).toEqual({ view: "hidden" });
    store.checkLocalData();
    expect(store.getLocalImportState()).toEqual({ view: "hidden" });
    // Signing in again forgets it.
    deferral.forgetImportDeferral();
    store.checkLocalData();
    expect(store.getLocalImportState().view).toBe("offer");
    expect(local.clears).toBe(0);
  });

  it("never clears data it can't read; only a confirmed Discard does", async () => {
    local.data = { status: "unreadable", reason: "Damaged.", raw: "{" };
    const store = await load();
    store.checkLocalData();
    expect(store.getLocalImportState()).toMatchObject({ view: "unreadable", raw: "{" });
    await store.startImport("w");
    expect(store.getLocalImportState().view).toBe("unreadable");
    store.askDiscard();
    store.cancelDiscard();
    expect(store.getLocalImportState().view).toBe("unreadable");
    expect(local.clears).toBe(0);
    store.askDiscard();
    await store.discardLocalData();
    expect(local.clears).toBe(1);
    expect(store.getLocalImportState()).toEqual({ view: "hidden" });
  });

  it("keeps the data when the import fails, and when something had to be left out", async () => {
    const store = await load();
    store.checkLocalData();
    local.outcome = { ok: false, failure: "offline" };
    await store.startImport("w");
    expect(store.getLocalImportState()).toEqual({ view: "failed", failure: "offline" });
    local.outcome = { ok: true, report: REPORT };
    await store.startImport("w");
    expect(store.getLocalImportState()).toEqual({ view: "done", report: REPORT });
    store.finishImport();
    const { importDeferred } = await import("./import-deferral");
    expect(importDeferred()).toBe(true);
    expect(local.clears).toBe(0);
  });

  it("has Squiggy cheer only when the import moved something in", async () => {
    const store = await load();
    const { onSquiggy } = await import("../squiggy/events");
    const heard: SquiggyEvent[] = [];
    onSquiggy(({ event }) => heard.push(event));
    store.checkLocalData();
    local.outcome = { ok: true, report: { ...REPORT, cleared: true } };
    await store.startImport("w");
    expect(heard).toEqual([]);
    store.finishImport();
    store.checkLocalData();
    local.outcome = { ok: true, report: { ...REPORT, projects: 2, cleared: true, moved: true } };
    await store.startImport("w");
    expect(heard).toEqual([{ type: "imported", partial: false }]);
    store.finishImport();
    store.checkLocalData();
    local.outcome = { ok: true, report: { ...REPORT, projects: 1, moved: true } };
    await store.startImport("w");
    expect(heard.at(-1)).toEqual({ type: "imported", partial: true });
  });

  it("runs one import at a time, however often Import is pressed", async () => {
    const store = await load();
    store.checkLocalData();
    local.outcome = { ok: true, report: { ...REPORT, cleared: true } };
    const first = store.startImport("w");
    expect(store.startImport("w")).toBe(first);
    await first;
  });
});
