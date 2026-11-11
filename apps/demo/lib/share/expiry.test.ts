import type { PinDraft } from "@pinpoint/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as cronRoute from "@/app/api/cron/expire/route";
import { storageFromEnv } from "@/lib/pinpoint-storage";
import { RECORD, STATE } from "@/test/share-fixture";
import {
  addFolder,
  NOW,
  seat,
  TEST_AUTH_SECRET,
  twoWorkspaces,
  URL_PROJECT,
} from "@/test/workspace-fixture";
import { createProject, trashProject } from "../workspace/projects";
import { attachShare } from "../workspace/share-links";
import { inlineBackend, type BlobBackend } from "./blob-backend";
import { EXPIRY_BATCH, expireShares, sweepOrphanedBlobs } from "./expiry";
import { createMemoryStore } from "./memory-store";
import { sweepOrphanBlobs } from "./orphan-blobs";
import { createPostgresStore } from "./postgres-store";
import { createShare } from "./service";
import { ORPHAN_BLOB_MS, RETENTION_MS, shareExpiresAt } from "./retention";
import type { ShareServices } from "./server";
import type { ShareStore } from "./store";

const SECRET = "cron-secret-for-tests";
const DAY = 86_400_000;

const holder = globalThis as typeof globalThis & { squintShares?: Promise<ShareServices> };

/** The route uses these services (the same seam `shareServices()` fills). */
function use(services: ShareServices) {
  holder.squintShares = Promise.resolve(services);
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  // Pinpoint in memory: the same storage this test seeds.
  vi.stubEnv("GITHUB_TOKEN", "");
  vi.stubEnv("DATABASE_URL", "");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  holder.squintShares = undefined;
  vi.unstubAllEnvs();
});

const cron = (authorization?: string) =>
  cronRoute.GET(
    new Request("http://localhost/api/cron/expire", {
      headers: authorization ? { authorization } : {},
    }),
  );

/** A store with `expired` shares past retention and `live` ones that aren't, and its expiry queries. */
async function storeWith(expired: number, live: number) {
  const store = createMemoryStore();
  const now = Date.now();
  const add = (id: string, createdAt: number) =>
    store.create({ ...RECORD, id, createdAt, expiresAt: shareExpiresAt({}, createdAt) });
  for (let index = 0; index < expired; index += 1) {
    await add(`old-${index}`, now - RETENTION_MS - (index + 1) * 1000);
  }
  for (let index = 0; index < live; index += 1) {
    // Up to a minute short of 30 days: kept.
    await add(`live-${index}`, now - RETENTION_MS + 60_000 + index * DAY);
  }
  const queries = vi.fn((cutoff: number, limit: number) => store.expiredIds(cutoff, limit));
  const counted: ShareStore = { ...store, expiredIds: queries };
  return { store: counted, queries };
}

const ids = async (store: ShareStore, prefix: string, count: number) => {
  const found = await Promise.all(
    Array.from({ length: count }, (_, index) => store.byId(`${prefix}-${index}`)),
  );
  return found.filter(Boolean).length;
};

describe("expiry cron: who may run it", () => {
  it("refuses every call while CRON_SECRET is unset or empty, and deletes nothing", async () => {
    const { store, queries } = await storeWith(1, 0);
    use({ store, blobs: inlineBackend });
    for (const value of [undefined, "", "  "]) {
      vi.stubEnv("CRON_SECRET", value);
      for (const header of [undefined, "Bearer undefined", "Bearer ", `Bearer ${SECRET}`]) {
        const response = await cron(header);
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "not-configured" });
      }
    }
    expect(queries).not.toHaveBeenCalled();
    expect(await store.byId("old-0")).not.toBeNull();
  });

  it("answers 401 to a missing or wrong bearer token", async () => {
    const { store, queries } = await storeWith(1, 0);
    use({ store, blobs: inlineBackend });
    for (const header of [
      undefined,
      SECRET,
      `Bearer ${SECRET}x`,
      `Bearer ${SECRET.toUpperCase()}`,
      `Basic ${SECRET}`,
      "Bearer undefined",
    ]) {
      const response = await cron(header);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }
    expect(queries).not.toHaveBeenCalled();
  });
});

describe("expiry cron: what it deletes", () => {
  it("deletes only shares past 30 days, in batches, until none are left", async () => {
    const { store, queries } = await storeWith(EXPIRY_BATCH * 2 + 50, 3);
    use({ store, blobs: inlineBackend });

    const response = await cron(`Bearer ${SECRET}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ shares: 250, blobs: null, done: true });
    expect(queries).toHaveBeenCalledTimes(3);
    expect(await ids(store, "old", 250)).toBe(0);
    expect(await ids(store, "live", 3)).toBe(3);
  });

  it("then sweeps orphaned Blob files a day past retention, counting expired shares as gone", async () => {
    const { store } = await storeWith(1, 1);
    const sweep = vi.fn<NonNullable<BlobBackend["sweep"]>>(() =>
      Promise.resolve({ deleted: 4, done: true }),
    );
    use({ store, blobs: { ...inlineBackend, sweep } });
    const before = Date.now();

    const report = (await (await cron(`Bearer ${SECRET}`)).json()) as Record<string, unknown>;

    expect(report).toMatchObject({ shares: 1, blobs: 4, done: true });
    const [cutoff, isLive] = sweep.mock.calls[0] ?? [];
    expect(cutoff).toBeGreaterThanOrEqual(before - ORPHAN_BLOB_MS);
    expect(cutoff).toBeLessThanOrEqual(Date.now() - ORPHAN_BLOB_MS);
    expect(await isLive?.("live-0")).toBe(true);
    expect(await isLive?.("old-0")).toBe(false);
  });

  it("then deletes pinpoint pins created 30 or more days ago", async () => {
    use({ store: (await storeWith(0, 0)).store, blobs: inlineBackend });
    const { storage } = storageFromEnv();
    const iso = (ms: number) => new Date(ms).toISOString();
    const pin = (id: string, createdAt: string): PinDraft => ({
      id,
      path: "/expiry",
      branch: "feature/expiry",
      deploymentUrl: "https://preview.example",
      deepLink: `https://preview.example/expiry?pin=${id}`,
      anchor: { selector: "#a", xPct: 1, yPct: 1, viewportXPct: 1, viewportYPct: 1 },
      author: "Ana",
      body: "Hi",
      priority: null,
      context: { viewport: { width: 1280, height: 800 }, userAgent: "vitest" },
      replies: [],
      resolved: false,
      resolvedAt: null,
      resolvedBy: null,
      createdAt,
      screenshot: null,
    });
    await storage.createPin(pin("pin-old", iso(Date.now() - RETENTION_MS - DAY)));
    await storage.createPin(pin("pin-new", iso(Date.now() - RETENTION_MS + DAY)));

    const report = (await (await cron(`Bearer ${SECRET}`)).json()) as Record<string, unknown>;

    expect(report).toMatchObject({ shares: 0, pins: 1 });
    const left = await storage.listPins({ branch: "feature/expiry", path: "/expiry" });
    expect(left.map((entry) => entry.id)).toEqual(["pin-new"]);
  });
});

describe("expiry cron: each step on its own", () => {
  type Step = "shares" | "blobs" | "trash" | "accounts" | "workspaceBlobs" | "pins";
  const failed = (steps: Partial<Record<Step, boolean>>) => ({
    shares: false,
    blobs: false,
    trash: false,
    accounts: false,
    workspaceBlobs: false,
    pins: false,
    ...steps,
  });

  /** Fails the way a driver might: with a URL and credentials in the message. */
  const leaky = () => new Error("connect to postgres://user:hunter2@db.example/squint failed");

  function quietErrors() {
    return vi.spyOn(console, "error").mockImplementation(() => undefined);
  }

  it("still sweeps Blob files and expires pins when the share step fails, and says which failed", async () => {
    const errors = quietErrors();
    const { store } = await storeWith(1, 0);
    const sweep = vi.fn<NonNullable<BlobBackend["sweep"]>>(() =>
      Promise.resolve({ deleted: 2, done: true }),
    );
    use({
      store: { ...store, expiredIds: () => Promise.reject(leaky()) },
      blobs: { ...inlineBackend, sweep },
    });
    const pinsExpire = vi.spyOn(storageFromEnv().storage, "expire");

    const response = await cron(`Bearer ${SECRET}`);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      shares: null,
      blobs: 2,
      // No DATABASE_URL: the workspace steps are skipped.
      trash: null,
      accounts: null,
      workspaceBlobs: null,
      pins: 0,
      done: false,
      failed: failed({ shares: true }),
    });
    expect(sweep).toHaveBeenCalledOnce();
    expect(pinsExpire).toHaveBeenCalledOnce();
    // The log names the step and the error's kind, never its message.
    expect(errors.mock.calls).toEqual([["squint expiry: shares failed (Error)"]]);
  });

  it("still expires shares when the pin step fails", async () => {
    const errors = quietErrors();
    const { store } = await storeWith(2, 1);
    use({ store, blobs: inlineBackend });
    const failure = Object.assign(leaky(), { status: 502 });
    vi.spyOn(storageFromEnv().storage, "expire").mockRejectedValue(failure);

    const response = await cron(`Bearer ${SECRET}`);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      shares: 2,
      blobs: null,
      trash: null,
      accounts: null,
      workspaceBlobs: null,
      pins: null,
      done: false,
      failed: failed({ pins: true }),
    });
    expect(await ids(store, "old", 2)).toBe(0);
    expect(errors.mock.calls).toEqual([["squint expiry: pins failed (Error 502)"]]);
  });

  it("still expires pins when the share database can't be reached", async () => {
    quietErrors();
    holder.squintShares = Promise.reject(leaky());
    holder.squintShares.catch(() => undefined);
    const pinsExpire = vi.spyOn(storageFromEnv().storage, "expire");

    const report = (await (await cron(`Bearer ${SECRET}`)).json()) as Record<string, unknown>;

    expect(report).toMatchObject({
      shares: null,
      blobs: null,
      failed: failed({ shares: true, blobs: true }),
    });
    expect(pinsExpire).toHaveBeenCalledOnce();
  });

  it("expires pins without waiting for the shares to finish", async () => {
    const { store } = await storeWith(1, 0);
    let release = () => undefined as void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    use({
      store: {
        ...store,
        expiredIds: async (now, limit) => {
          await held;
          return store.expiredIds(now, limit);
        },
      },
      blobs: inlineBackend,
    });
    // Only a pin step that runs while the shares wait lets them go on.
    const pins = storageFromEnv().storage;
    const expire = pins.expire?.bind(pins);
    vi.spyOn(pins, "expire").mockImplementation((cutoff, deadline) => {
      release();
      return expire ? expire(cutoff, deadline) : Promise.resolve({ expired: 0, done: true });
    });

    const response = await cron(`Bearer ${SECRET}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ shares: 1, failed: failed({}) });
  });

  it("passes the pin step the same deadline the shares stop at", async () => {
    use({ store: (await storeWith(0, 0)).store, blobs: inlineBackend });
    const pinsExpire = vi.spyOn(storageFromEnv().storage, "expire");
    const before = Date.now();

    await cron(`Bearer ${SECRET}`);

    const [cutoff, deadline] = pinsExpire.mock.calls[0] ?? [];
    expect(cutoff).toBeGreaterThanOrEqual(before - RETENTION_MS);
    expect(deadline).toBeGreaterThanOrEqual(before + 45_000);
    expect(deadline).toBeLessThanOrEqual(Date.now() + 45_000);
  });
});

describe("expireShares", () => {
  it("stops at the deadline and leaves the rest for the next run", async () => {
    const { store } = await storeWith(3, 0);
    const services: ShareServices = { store, blobs: inlineBackend };
    expect(await expireShares(services, Date.now(), Date.now() - 1)).toEqual({
      expired: 0,
      done: false,
    });
    expect(await ids(store, "old", 3)).toBe(3);
    expect(await expireShares(services, Date.now(), Infinity)).toEqual({ expired: 3, done: true });
  });

  it("discards the Blob files of the shares it expires", async () => {
    const { store } = await storeWith(1, 0);
    const location = { kind: "vercel" as const, url: "https://blob.example/squint/old-0/x" };
    await store.putBlob("old-0", { key: "crop:c-1", contentType: "image/png", size: 1, location });
    const discard = vi.fn<BlobBackend["discard"]>(() => Promise.resolve());
    await expireShares({ store, blobs: { ...inlineBackend, discard } }, Date.now(), Infinity);
    expect(discard).toHaveBeenCalledWith([location]);
  });
});

describe("the orphaned Blob sweep", () => {
  /** A shared project for each state to tell apart, named after it, in three workspaces. */
  async function workspaceShares() {
    const { db, a, b } = await twoWorkspaces();
    const c = await seat(db, "charlie");
    const store = createPostgresStore(db);
    const shareIn = async (workspaceId: string, projectId: string) => {
      await addFolder(db, workspaceId, `f-${projectId}`);
      await createProject(db, workspaceId, URL_PROJECT(projectId, `f-${projectId}`), NOW);
      const share = await createShare({ store, blobs: inlineBackend }, STATE, NOW);
      const input = { shareId: share.shareId, token: share.token, ownerKey: share.ownerKey };
      await db.transaction((tx) =>
        attachShare(tx, workspaceId, projectId, input, NOW, TEST_AUTH_SECRET),
      );
      return share.shareId;
    };
    return {
      db,
      store,
      ids: {
        open: await shareIn(a.workspaceId, "open"),
        trashed: await shareIn(a.workspaceId, "trashed"),
        archived: await shareIn(b.workspaceId, "archived"),
        pending: await shareIn(c.workspaceId, "pending"),
        revoked: await shareIn(a.workspaceId, "revoked"),
      },
      workspaces: { a: a.workspaceId, b: b.workspaceId, c: c.workspaceId },
    };
  }

  it("keeps the files of a share that's only closed, and deletes those of one that's gone", async () => {
    const { db, store, ids, workspaces } = await workspaceShares();
    await trashProject(db, workspaces.a, "trashed", NOW);
    await db.query("UPDATE workspaces SET archived_at = now() WHERE id = $1", [workspaces.b]);
    await db.query("UPDATE workspaces SET delete_after = now() WHERE id = $1", [workspaces.c]);
    await store.remove(ids.revoked);
    for (const id of [ids.trashed, ids.archived, ids.pending, ids.revoked]) {
      expect(await store.byId(id)).toBeNull();
    }

    const now = Date.now();
    const uploadedAt = new Date(now - ORPHAN_BLOB_MS - DAY);
    const files = Object.values(ids).map((id) => ({
      url: `https://blob.test/squint/${id}/page-1.png`,
      pathname: `squint/${id}/page-1.png`,
      uploadedAt,
    }));
    const deleted: string[] = [];
    const api = {
      list: () => Promise.resolve({ blobs: files, hasMore: false }),
      del: (urls: string[]) => {
        deleted.push(...urls);
        return Promise.resolve();
      },
    };
    const blobs: BlobBackend = {
      ...inlineBackend,
      sweep: (before, isLive, deadline) => sweepOrphanBlobs(api, before, isLive, deadline),
    };

    expect(await sweepOrphanedBlobs({ store, blobs }, now, Infinity)).toEqual({
      deleted: 1,
      done: true,
    });
    expect(deleted).toEqual([`https://blob.test/squint/${ids.revoked}/page-1.png`]);
  });
});
