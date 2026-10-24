import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { COMMENT, PNG, RECORD, SNAPSHOT } from "@/test/share-fixture";
import { createMemoryStore } from "./memory-store";
import { migrate, type Queryable } from "./migrate";
import { createPostgresStore } from "./postgres-store";
import { inlineBackend } from "./blob-backend";
import type { ShareServices } from "./server";
import { addClientComment, expireStalePending, PENDING_STALE_MS, readBlob } from "./service";
import type { ShareStore } from "./store";

/**
 * PGlite is Postgres compiled to WebAssembly: the real SQL, no server. Like
 * `pg`, parameterless queries use the simple protocol (several statements allowed).
 */
function adapt(db: PGlite): Queryable {
  return {
    async query<Row>(text: string, params?: unknown[]) {
      if (params?.length) return db.query<Row>(text, params);
      const results = await db.exec(text);
      return { rows: (results.at(-1)?.rows ?? []) as Row[] };
    },
  };
}

async function pglite(): Promise<Queryable> {
  const db = adapt(new PGlite());
  await migrate(db);
  return db;
}

const stores: Array<[string, () => Promise<ShareStore>]> = [
  ["memory", () => Promise.resolve(createMemoryStore())],
  ["postgres", async () => createPostgresStore(await pglite())],
];

describe.each(stores)("%s share store", (_name, make) => {
  it("creates, finds by id and token hash, and updates the project", async () => {
    const store = await make();
    await store.create(RECORD);
    expect(await store.byId(RECORD.id)).toEqual(RECORD);
    expect(await store.byTokenHash(RECORD.tokenHash)).toEqual(RECORD);
    expect(await store.byTokenHash("c".repeat(64))).toBeNull();
    const project = { name: "Renamed", source: RECORD.project.source };
    await store.setProject(RECORD.id, project, 9);
    expect(await store.byId(RECORD.id)).toMatchObject({ project, updatedAt: 9 });
  });

  it("keeps origin and seq when an upsert replaces a row, and refuses taken ids on insert", async () => {
    const store = await make();
    await store.create(RECORD);
    await store.upsertSnapshot(RECORD.id, SNAPSHOT, "owner");
    expect(await store.insertComment(RECORD.id, COMMENT, "client")).toBe(true);
    expect(await store.insertComment(RECORD.id, COMMENT, "client")).toBe(false);
    const [before] = await store.comments(RECORD.id);
    await store.upsertComment(RECORD.id, { ...COMMENT, status: "resolved" }, "owner");
    const [after] = await store.comments(RECORD.id);
    expect(after).toEqual({
      item: { ...COMMENT, status: "resolved" },
      origin: "client",
      seq: before?.seq,
    });
    const [snapshot] = await store.snapshots(RECORD.id);
    expect(snapshot?.seq).toBeLessThan(after?.seq ?? 0);
  });

  it("stores blobs, lists sizes, and deletes rows", async () => {
    const store = await make();
    await store.create(RECORD);
    const blob = {
      key: "crop:c-1",
      contentType: "image/png",
      size: PNG.length,
      location: { kind: "inline" as const, bytes: PNG },
    };
    await store.putBlob(RECORD.id, blob);
    expect(await store.blobSizes(RECORD.id)).toEqual([{ key: "crop:c-1", size: PNG.length }]);
    const read = await store.getBlob(RECORD.id, "crop:c-1");
    expect(read?.location.kind === "inline" && [...read.location.bytes]).toEqual([...PNG]);
    expect(await store.deleteBlobs(RECORD.id, ["crop:c-1"])).toHaveLength(1);
    expect(await store.getBlob(RECORD.id, "crop:c-1")).toBeNull();
    await store.upsertSnapshot(RECORD.id, SNAPSHOT, "owner");
    await store.deleteSnapshots(RECORD.id, [SNAPSHOT.id]);
    expect(await store.snapshots(RECORD.id)).toEqual([]);
  });

  it("keeps a pending comment invisible but claimed, then confirms it with a fresh seq", async () => {
    const store = await make();
    await store.create(RECORD);
    expect(await store.insertComment(RECORD.id, COMMENT, "client", { pending: true })).toBe(true);
    expect(await store.comments(RECORD.id)).toEqual([]);
    expect(await store.comments(RECORD.id, { includePending: true })).toHaveLength(1);
    expect(await store.insertComment(RECORD.id, COMMENT, "client")).toBe(false);
    await store.upsertSnapshot(RECORD.id, SNAPSHOT, "client");
    const [snapshot] = await store.snapshots(RECORD.id);
    await store.confirmComment(RECORD.id, COMMENT.id);
    const [confirmed] = await store.comments(RECORD.id);
    expect(confirmed?.item).toEqual(COMMENT);
    // Confirmed after the snapshot was added, so a pull at the snapshot's seq still sees it.
    expect(confirmed?.seq).toBeGreaterThan(snapshot?.seq ?? Infinity);
  });

  it("keeps upload parts in order until they're deleted", async () => {
    const store = await make();
    await store.create(RECORD);
    await store.putBlobPart(RECORD.id, "snapshot:snap-1", 1, new Uint8Array([3, 4]));
    await store.putBlobPart(RECORD.id, "snapshot:snap-1", 0, new Uint8Array([1, 2]));
    const parts = await store.blobParts(RECORD.id, "snapshot:snap-1");
    expect(parts.map(({ part, bytes }) => [part, [...bytes]])).toEqual([
      [0, [1, 2]],
      [1, [3, 4]],
    ]);
    await store.deleteBlobParts(RECORD.id, "snapshot:snap-1");
    expect(await store.blobParts(RECORD.id, "snapshot:snap-1")).toEqual([]);
  });

  it("removes a share with everything under it", async () => {
    const store = await make();
    await store.create(RECORD);
    await store.upsertComment(RECORD.id, COMMENT, "owner");
    await store.putBlob(RECORD.id, {
      key: "image",
      contentType: "image/png",
      size: 1,
      location: { kind: "vercel", url: "https://blob.example/x" },
    });
    expect(await store.remove(RECORD.id)).toEqual([
      { kind: "vercel", url: "https://blob.example/x" },
    ]);
    expect(await store.byId(RECORD.id)).toBeNull();
    expect(await store.comments(RECORD.id)).toEqual([]);
  });
});

describe("migrate", () => {
  it("is idempotent", async () => {
    const db = adapt(new PGlite());
    expect(await migrate(db)).toEqual([
      "001_squint_shares",
      "002_squint_share_blob_parts",
      "003_squint_share_pending_comments",
    ]);
    expect(await migrate(db)).toEqual([]);
  });
});

describe.each(stores)("%s store: two posts with the same id at once", (_name, make) => {
  it("lets exactly one win, stores its crop, and leaves nothing of the other", async () => {
    const services: ShareServices = { store: await make(), blobs: inlineBackend };
    const { store } = services;
    await store.create(RECORD);
    const input = {
      id: "same",
      x: 1,
      y: 1,
      body: "Hi",
      author: "Cleo",
      crop: { rect: { x: 0, y: 0, width: 4, height: 4 } },
    };
    const cropA = new Uint8Array([...PNG, 0xaa]);
    const cropB = new Uint8Array([...PNG, 0xbb]);
    const [a, b] = await Promise.all([
      addClientComment(services, RECORD, input, cropA, 1),
      addClientComment(services, RECORD, input, cropB, 2),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const loser = a.ok ? b : a;
    expect(loser).toMatchObject({ ok: false, status: 409 });
    const winnerCrop = a.ok ? cropA : cropB;
    const stored = await readBlob(services, RECORD, "crop:same");
    expect([...(stored?.bytes ?? [])]).toEqual([...winnerCrop]);
    expect(await store.blobSizes(RECORD.id)).toEqual([
      { key: "crop:same", size: winnerCrop.length },
    ]);
    const visible = await store.comments(RECORD.id);
    expect(visible.map((row) => row.item.createdAt)).toEqual([a.ok ? 1 : 2]);
  });
});

describe.each(stores)("%s store: claims orphaned mid-post", (_name, make) => {
  const NOW = 10_000_000;
  const STALE = NOW - PENDING_STALE_MS - 1;
  const rect = { x: 0, y: 0, width: 4, height: 4 };
  const input = { id: "orphan", x: 1, y: 1, body: "Hi", author: "Cleo", crop: { rect } };
  const oldCrop = new Uint8Array([...PNG, 0x01]);
  const newCrop = new Uint8Array([...PNG, 0x02]);

  /** A share with a pending claim made at `claimedAt`, and the crop its request had stored. */
  async function orphaned(claimedAt: number): Promise<ShareServices> {
    const services: ShareServices = { store: await make(), blobs: inlineBackend };
    const { store } = services;
    await store.create(RECORD);
    const comment = {
      ...input,
      status: "active" as const,
      createdAt: claimedAt,
      updatedAt: claimedAt,
    };
    await store.insertComment(RECORD.id, comment, "client", { pending: true });
    const location = { kind: "inline" as const, bytes: oldCrop };
    await store.putBlob(RECORD.id, {
      key: "crop:orphan",
      contentType: "image/png",
      size: oldCrop.length,
      location,
    });
    return services;
  }

  it("lets a retry reclaim a stale claim: one visible row, with the retry's crop", async () => {
    const services = await orphaned(STALE);
    expect(await addClientComment(services, RECORD, input, newCrop, NOW)).toMatchObject({
      ok: true,
    });
    const visible = await services.store.comments(RECORD.id, { includePending: true });
    expect(visible.map((row) => [row.item.id, row.item.createdAt])).toEqual([["orphan", NOW]]);
    expect(await services.store.pendingSince(RECORD.id, "orphan")).toBeNull();
    const stored = await readBlob(services, RECORD, "crop:orphan");
    expect([...(stored?.bytes ?? [])]).toEqual([...newCrop]);
    expect(await services.store.blobSizes(RECORD.id)).toEqual([
      { key: "crop:orphan", size: newCrop.length },
    ]);
  });

  it("drops the stale crop when the retry has none", async () => {
    const services = await orphaned(STALE);
    const { crop: _none, ...plain } = input;
    expect(await addClientComment(services, RECORD, plain, null, NOW)).toMatchObject({ ok: true });
    expect(await services.store.blobSizes(RECORD.id)).toEqual([]);
  });

  it("still refuses a claim in progress (409 pending), so a race has one winner", async () => {
    const services = await orphaned(NOW - 1_000);
    expect(await addClientComment(services, RECORD, input, newCrop, NOW)).toMatchObject({
      ok: false,
      status: 409,
      error: "pending",
    });
    expect(await services.store.pendingSince(RECORD.id, "orphan")).toBe(NOW - 1_000);
    const stored = await readBlob(services, RECORD, "crop:orphan");
    expect([...(stored?.bytes ?? [])]).toEqual([...oldCrop]);
  });

  it("expires stale claims and their crops, and leaves fresh ones", async () => {
    const services = await orphaned(STALE);
    const fresh = {
      ...input,
      id: "fresh",
      status: "active" as const,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await services.store.insertComment(RECORD.id, fresh, "client", { pending: true });
    await expireStalePending(services, RECORD, NOW);
    const left = await services.store.comments(RECORD.id, { includePending: true });
    expect(left.map((row) => row.item.id)).toEqual(["fresh"]);
    expect(await services.store.blobSizes(RECORD.id)).toEqual([]);
  });
});
