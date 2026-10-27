import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, SquintData } from "./types";

const DAY = 86_400_000;
/** 2026-09-01T00:00:00Z, in epoch ms. */
const T0 = Date.UTC(2026, 8, 1);
const day = (n: number) => T0 + n * DAY;

const project = (id: string, createdAt: number): Project => ({
  id,
  folderId: "f",
  name: id,
  source: { kind: "url", url: "https://example.com/" },
  createdAt,
  updatedAt: createdAt,
});

const data = (projects: Project[]): SquintData => ({
  version: 3,
  folders: [{ id: "f", name: "Work", createdAt: T0, parentId: null }],
  projects,
  comments: [],
  snapshots: [],
  revocations: [],
  authorName: null,
});

/** A fresh module: `retentionStart` remembers its value per page load. */
async function load() {
  vi.resetModules();
  return import("./expiry");
}

function fakeStorage(blocked = false): Storage {
  const items = new Map<string, string>();
  const guard = () => {
    if (blocked) throw new DOMException("Blocked", "SecurityError");
  };
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => (guard(), items.get(key) ?? null),
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => {
      guard();
      items.set(key, String(value));
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("projectExpiresAt", () => {
  it("is 30 days after the project was created", async () => {
    const { projectExpiresAt } = await load();
    expect(projectExpiresAt(project("a", day(0)), day(0))).toBe(day(30));
    expect(projectExpiresAt(project("a", day(10)), day(0))).toBe(day(40));
  });

  it("is never sooner than 5 days after retention started in this browser", async () => {
    const { projectExpiresAt } = await load();
    // Created 60 days before this browser started counting: 5 days' notice first.
    expect(projectExpiresAt(project("a", day(0)), day(60))).toBe(day(65));
    expect(projectExpiresAt(project("a", day(0)), day(25))).toBe(day(30));
    expect(projectExpiresAt(project("a", day(0)), day(26))).toBe(day(31));
  });

  it("counts a malformed creation date from when retention started", async () => {
    const { projectExpiresAt } = await load();
    const seconds = Math.floor(day(0) / 1000);
    expect(projectExpiresAt(project("a", seconds), day(60))).toBe(day(90));
    expect(projectExpiresAt(project("a", Number.NaN), day(60))).toBe(day(90));
  });
});

describe("expiredProjects", () => {
  const projects = [project("old", day(0)), project("mid", day(4)), project("new", day(20))];

  it("lists projects past their date, on the dot", async () => {
    const { expiredProjects } = await load();
    const ids = (now: number) => expiredProjects(data(projects), day(0), now).map((p) => p.id);
    expect(ids(day(30) - 1)).toEqual([]);
    expect(ids(day(30))).toEqual(["old"]);
    expect(ids(day(50))).toEqual(["old", "mid", "new"]);
  });
});

describe("retentionStart", () => {
  it("is set on the first load and kept from then on", async () => {
    const first = await load();
    expect(first.retentionStart(day(3))).toBe(day(3));
    expect(localStorage.getItem(first.RETENTION_START_KEY)).toBe(String(day(3)));
    const later = await load();
    expect(later.retentionStart(day(9))).toBe(day(3));
  });

  it("replaces a value that isn't epoch ms", async () => {
    const { retentionStart, RETENTION_START_KEY } = await load();
    localStorage.setItem(RETENTION_START_KEY, "1700000000");
    expect(retentionStart(day(3))).toBe(day(3));
  });

  it("counts from this visit while storage is blocked, and stays steady", async () => {
    vi.stubGlobal("localStorage", fakeStorage(true));
    const { retentionStart } = await load();
    expect(retentionStart(day(3))).toBe(day(3));
    expect(retentionStart(day(9))).toBe(day(3));
  });

  it("reads during render without saving, and agrees with it after", async () => {
    const { readRetentionStart, retentionStart, RETENTION_START_KEY } = await load();
    expect(readRetentionStart(day(3))).toBe(day(3));
    expect(localStorage.getItem(RETENTION_START_KEY)).toBeNull();
    expect(retentionStart(day(4))).toBe(day(4));
    expect(readRetentionStart(day(9))).toBe(day(4));
    // A later load reads the saved start.
    const later = await load();
    expect(later.readRetentionStart(day(9))).toBe(day(4));
  });

  it("reads `now` where there's no storage, as on the server", async () => {
    vi.stubGlobal("localStorage", undefined);
    const { readRetentionStart } = await load();
    expect(readRetentionStart(day(3))).toBe(day(3));
  });
});
