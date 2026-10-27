import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { COMMENT, JPEG, PNG, RECORD, SNAPSHOT, STATE } from "@/test/share-fixture";
import { toShareState } from "../share-client/share-state";
import { parseData } from "../store/persist";
import { digest } from "./digest";
import { projectSchema } from "./schemas";
import { createMemoryStore } from "./memory-store";
import { MIGRATIONS, migrate, type Queryable } from "./migrate";
import { createPostgresStore } from "./postgres-store";
import { shareExpiresAt } from "./retention";
import { inlineBackend, type BlobBackend } from "./blob-backend";
import type { ShareServices } from "./server";
import {
  addClientComment,
  captureForClient,
  expireStalePending,
  PENDING_STALE_MS,
  pullChanges,
  readBlob,
} from "./service";
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

/** Stored blobs, with each per-claim crop key's random nonce masked as `<claim>`. */
async function storedBlobs(store: ShareStore) {
  const sizes = await store.blobSizes(RECORD.id);
  return sizes.map(({ key, size }) => ({
    key: key.replace(/^(crop:[^:]+):.+$/, "$1:<claim>"),
    size,
  }));
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
    await store.setProject(RECORD.id, project, 9, 12);
    expect(await store.byId(RECORD.id)).toMatchObject({ project, updatedAt: 9, expiresAt: 12 });
  });

  it("lists shares expired by `now`, soonest first, up to the limit", async () => {
    const store = await make();
    /** 2026-10-27T00:00:00Z: real epoch ms, as `Date.now()` gives. */
    const NOW = Date.UTC(2026, 9, 27);
    const DAY = 86_400_000;
    const shares: Array<[string, number]> = [
      ["later", NOW + 1],
      ["edge", NOW],
      ["first", NOW - 10 * DAY],
      ["second", NOW - 5 * DAY],
      ["next-month", NOW + 30 * DAY],
    ];
    for (const [index, [id, expiresAt]] of shares.entries()) {
      await store.create({
        ...RECORD,
        id,
        tokenHash: String(index).repeat(64),
        createdAt: NOW - DAY,
        expiresAt,
      });
    }
    expect(await store.expiredIds(NOW, 2)).toEqual(["first", "second"]);
    expect(await store.expiredIds(NOW, 100)).toEqual(["first", "second", "edge"]);
    // A push moves the date, and the query with it.
    await store.setProject("later", RECORD.project, NOW, NOW - DAY);
    expect(await store.expiredIds(NOW, 100)).toEqual(["first", "second", "later", "edge"]);
    await store.remove("first");
    expect(await store.expiredIds(NOW, 1)).toEqual(["second"]);
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
    const claim = { claim: "n-1", cropKey: "crop:c-1:n-1" };
    expect(await store.insertComment(RECORD.id, COMMENT, "client", claim)).toBe(true);
    expect(await store.comments(RECORD.id)).toEqual([]);
    expect(await store.comments(RECORD.id, { includePending: true })).toHaveLength(1);
    expect(await store.cropKeyOf(RECORD.id, COMMENT.id)).toBeNull();
    expect(await store.insertComment(RECORD.id, COMMENT, "client")).toBe(false);
    await store.upsertSnapshot(RECORD.id, SNAPSHOT, "client");
    const [snapshot] = await store.snapshots(RECORD.id);
    expect(await store.confirmComment(RECORD.id, COMMENT.id, "n-other")).toBe(false);
    expect(await store.deleteClaim(RECORD.id, COMMENT.id, "n-other")).toBe(false);
    expect(await store.confirmComment(RECORD.id, COMMENT.id, "n-1")).toBe(true);
    const [confirmed] = await store.comments(RECORD.id);
    expect(confirmed?.item).toEqual(COMMENT);
    expect(await store.cropKeyOf(RECORD.id, COMMENT.id)).toBe("crop:c-1:n-1");
    // Confirmed after the snapshot was added, so a pull at the snapshot's seq still sees it.
    expect(confirmed?.seq).toBeGreaterThan(snapshot?.seq ?? Infinity);
    // Once visible, the claim can neither confirm again nor delete it.
    expect(await store.confirmComment(RECORD.id, COMMENT.id, "n-1")).toBe(false);
    expect(await store.deleteClaim(RECORD.id, COMMENT.id, "n-1")).toBe(false);
    expect(await store.comments(RECORD.id)).toHaveLength(1);
  });

  it("keeps a pending snapshot invisible until it's confirmed with a fresh seq", async () => {
    const store = await make();
    await store.create(RECORD);
    await store.insertPendingSnapshot(RECORD.id, SNAPSHOT);
    expect(await store.snapshots(RECORD.id)).toEqual([]);
    expect(await store.snapshots(RECORD.id, { includePending: true })).toHaveLength(1);
    await store.upsertComment(RECORD.id, COMMENT, "client");
    const [comment] = await store.comments(RECORD.id);
    expect(await store.confirmSnapshot(RECORD.id, SNAPSHOT.id)).toBe(true);
    const [confirmed] = await store.snapshots(RECORD.id);
    expect(confirmed).toMatchObject({ item: SNAPSHOT, origin: "client" });
    expect(confirmed?.seq).toBeGreaterThan(comment?.seq ?? Infinity);
    expect(await store.confirmSnapshot(RECORD.id, SNAPSHOT.id)).toBe(false);
    expect(await store.deleteStalePendingSnapshots(RECORD.id, Number.MAX_SAFE_INTEGER)).toEqual([]);
  });

  it("expires only stale pending snapshots", async () => {
    const store = await make();
    await store.create(RECORD);
    await store.insertPendingSnapshot(RECORD.id, { ...SNAPSHOT, id: "old", createdAt: 1 });
    await store.insertPendingSnapshot(RECORD.id, { ...SNAPSHOT, id: "new", createdAt: 5 });
    await store.upsertSnapshot(RECORD.id, { ...SNAPSHOT, id: "owner", createdAt: 1 }, "owner");
    expect(await store.deleteStalePendingSnapshots(RECORD.id, 2)).toEqual(["old"]);
    expect(await store.confirmSnapshot(RECORD.id, "old")).toBe(false);
    const left = await store.snapshots(RECORD.id, { includePending: true });
    expect(left.map((row) => row.item.id).sort()).toEqual(["new", "owner"]);
  });

  it("binds confirms and deletes to the claim that holds the row", async () => {
    const store = await make();
    await store.create(RECORD);
    const pending = { ...COMMENT, createdAt: 1 };
    await store.insertComment(RECORD.id, pending, "client", { claim: "a", cropKey: "crop:c-1:a" });
    // Expiry wins: the expired claim can't confirm or delete what comes after it.
    expect(await store.deleteStalePending(RECORD.id, 2)).toEqual([COMMENT.id]);
    expect(await store.confirmComment(RECORD.id, COMMENT.id, "a")).toBe(false);
    await store.insertComment(RECORD.id, COMMENT, "client", { claim: "b", cropKey: "crop:c-1:b" });
    expect(await store.deleteClaim(RECORD.id, COMMENT.id, "a")).toBe(false);
    expect(await store.confirmComment(RECORD.id, COMMENT.id, "a")).toBe(false);
    expect(await store.deleteClaim(RECORD.id, COMMENT.id, "b")).toBe(true);
    expect(await store.comments(RECORD.id, { includePending: true })).toEqual([]);
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
      "004_squint_share_comment_claims",
      "005_squint_share_pending_snapshots",
      "006_squint_share_pages",
      "007_squint_shares_expires_at",
    ]);
    expect(await migrate(db)).toEqual([]);
  });

  it("006 turns shared image projects into one-page projects the owner's browser agrees with", async () => {
    const db = adapt(new PGlite());
    await db.query(`CREATE TABLE squint_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const migration of MIGRATIONS.slice(0, 5)) {
      await db.query(migration.sql);
      await db.query("INSERT INTO squint_migrations (id) VALUES ($1)", [migration.id]);
    }
    // Two shares saved before pages: an image project and a website.
    const legacy = {
      name: "Checkout",
      source: { kind: "image", fileName: "checkout.png", referenceUrl: "https://acme.example/" },
    };
    const onImage = { ...COMMENT, id: "on-image", snapshotId: undefined, crop: undefined };
    const onSnapshot = { ...COMMENT, id: "on-snapshot", crop: undefined };
    const insertShare = "INSERT INTO squint_shares VALUES ($1, $2, $3, $4, 1, 1)";
    await db.query(insertShare, ["old", "a".repeat(64), "b".repeat(64), JSON.stringify(legacy)]);
    await db.query(insertShare, [
      "site",
      "c".repeat(64),
      "d".repeat(64),
      JSON.stringify(STATE.project),
    ]);
    const insertComment =
      "INSERT INTO squint_share_comments (share_id, id, data, origin) VALUES ($1, $2, $3, 'owner')";
    await db.query(insertComment, ["old", "on-image", JSON.stringify(onImage)]);
    await db.query(insertComment, ["old", "on-snapshot", JSON.stringify(onSnapshot)]);
    await db.query(insertComment, ["site", "frame", JSON.stringify(onImage)]);
    await db.query(
      "INSERT INTO squint_share_blobs (share_id, key, content_type, size, bytes) VALUES ('old', 'image', 'image/png', $1, $2)",
      [PNG.length, PNG],
    );
    await db.query(
      "INSERT INTO squint_share_blob_parts (share_id, key, part, bytes) VALUES ('old', 'image', 0, $1)",
      [PNG],
    );

    expect(await migrate(db)).toEqual(["006_squint_share_pages", "007_squint_shares_expires_at"]);
    const store = createPostgresStore(db);
    const project = (await store.byId("old"))?.project;
    expect(project).toEqual({
      name: "Checkout",
      source: {
        kind: "pages",
        origin: "image",
        fileName: "checkout.png",
        referenceUrl: "https://acme.example/",
        pages: [{ id: "page-1", name: "checkout.png" }],
      },
    });
    expect(projectSchema.safeParse(project).success).toBe(true);
    const comments = (await store.comments("old")).map((row) => row.item);
    expect(comments).toEqual([{ ...onImage, pageId: "page-1" }, onSnapshot]);
    expect(await store.blobSizes("old")).toEqual([{ key: "page:page-1", size: PNG.length }]);
    expect(await store.blobParts("old", "image")).toEqual([]);
    // A website share is untouched.
    expect((await store.byId("site"))?.project).toEqual(STATE.project);
    expect((await store.comments("site")).map((row) => row.item)).toEqual([onImage]);

    // The owner's browser migrates the same project to the same shape: nothing is sent again.
    const parsed = parseData(
      JSON.stringify({
        version: 2,
        folders: [{ id: "f", name: "F", createdAt: 1 }],
        projects: [
          {
            id: "local",
            folderId: "f",
            name: "Checkout",
            source: { ...legacy.source, blobKey: "image:local" },
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        comments: [onImage, onSnapshot].map((comment) => ({ ...comment, projectId: "local" })),
      }),
    );
    if (!parsed.ok) throw new Error(parsed.reason);
    const [local] = parsed.data.projects;
    if (!local) throw new Error("no project");
    const pushed = toShareState(local, parsed.data.comments, []);
    // Apart from the project's creation time, which browsers now add (pushed once, for retention).
    const { createdAt: _created, ...pushedProject } = pushed.project;
    expect(digest(pushedProject)).toBe(digest(project));
    expect(pushed.comments.map(digest)).toEqual(comments.map(digest));

    // Running it again changes nothing.
    const sql = MIGRATIONS.find((migration) => migration.id === "006_squint_share_pages")?.sql;
    await db.query(sql ?? "");
    expect((await store.byId("old"))?.project).toEqual(project);
    expect((await store.comments("old")).map((row) => row.item)).toEqual(comments);
  });

  /** A database migrated up to 006, as one was before 007 shipped. */
  async function before007(): Promise<Queryable> {
    const db = adapt(new PGlite());
    await db.query(`CREATE TABLE squint_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const migration of MIGRATIONS.slice(0, 6)) {
      await db.query(migration.sql);
      await db.query("INSERT INTO squint_migrations (id) VALUES ($1)", [migration.id]);
    }
    return db;
  }

  const DAY = 86_400_000;
  const insertShare = "INSERT INTO squint_shares VALUES ($1, $2, $3, $4, $5, $5)";

  /** Saves a share made at `sharedAt` whose project says it was created at `createdAt`. */
  async function legacyShare(db: Queryable, id: string, createdAt: unknown, sharedAt: number) {
    const project = { ...STATE.project, createdAt };
    const hash = digest(id);
    await db.query(insertShare, [id, hash, hash, JSON.stringify(project), sharedAt]);
  }

  it("007 backfills when each share expires, by the same rule as the server", async () => {
    const db = await before007();
    // Links dated after the migration runs, so its deploy-time floor never decides here: this
    // compares the steady-state rule alone (the next test covers the floor).
    const SHARED = Date.UTC(2100, 9, 10);
    const CREATED = Date.UTC(2100, 9, 1);
    const cases: Record<string, unknown> = {
      ms: CREATED,
      // Over 25 days before the link: the 5-day notice floor decides.
      ancient: SHARED - 40 * DAY,
      seconds: Math.floor(CREATED / 1000),
      future: SHARED + 1,
      fraction: CREATED + 0.5,
      text: String(CREATED),
      null: null,
      huge: 1e30,
      none: undefined,
    };
    for (const [id, createdAt] of Object.entries(cases)) {
      await legacyShare(db, id, createdAt, SHARED);
    }

    expect(await migrate(db)).toEqual(["007_squint_shares_expires_at"]);
    const store = createPostgresStore(db);
    const stored: Record<string, number | undefined> = {};
    const expected: Record<string, number> = {};
    for (const [id, createdAt] of Object.entries(cases)) {
      stored[id] = (await store.byId(id))?.expiresAt;
      expected[id] = shareExpiresAt({ createdAt } as { createdAt?: number }, SHARED);
    }
    expect(stored).toEqual(expected);
    const fromLink = SHARED + 30 * DAY;
    expect(stored).toEqual({
      ms: CREATED + 30 * DAY,
      ancient: SHARED + 5 * DAY,
      seconds: fromLink,
      future: fromLink,
      fraction: fromLink,
      text: fromLink,
      null: fromLink,
      huge: fromLink,
      none: fromLink,
    });

    // The expiry query can use the index.
    await db.query("SET enable_seqscan = off");
    const plan = await db.query<{ "QUERY PLAN": string }>(
      "EXPLAIN SELECT id FROM squint_shares WHERE expires_at <= 5 ORDER BY expires_at, id LIMIT 100",
    );
    expect(plan.rows.map((row) => row["QUERY PLAN"]).join("\n")).toContain(
      "squint_shares_expires_at_idx",
    );

    // Running it again changes nothing.
    const sql = MIGRATIONS.find(
      (migration) => migration.id === "007_squint_shares_expires_at",
    )?.sql;
    await db.query(sql ?? "");
    expect((await store.byId("ms"))?.expiresAt).toBe(CREATED + 30 * DAY);
  });

  it("007 gives shares already old when it runs 5 days' notice from then", async () => {
    const db = await before007();
    const now = Date.now();
    // Shared 60 days ago; shared 27 days ago, 3 days from its 30; shared yesterday.
    await legacyShare(db, "stale", now - 61 * DAY, now - 60 * DAY);
    await legacyShare(db, "nearly", now - 27 * DAY, now - 27 * DAY);
    await legacyShare(db, "recent", now - 2 * DAY, now - DAY);

    const from = Date.now();
    expect(await migrate(db)).toEqual(["007_squint_shares_expires_at"]);
    // Postgres rounds its clock to the nearest ms, so up to 1 ms past `Date.now()`.
    const to = Date.now() + 1;

    const store = createPostgresStore(db);
    for (const id of ["stale", "nearly"]) {
      const expiresAt = (await store.byId(id))?.expiresAt ?? 0;
      expect(expiresAt).toBeGreaterThanOrEqual(from + 5 * DAY);
      expect(expiresAt).toBeLessThanOrEqual(to + 5 * DAY);
    }
    // A share with more than 5 days left keeps the server's own date.
    expect((await store.byId("recent"))?.expiresAt).toBe(
      shareExpiresAt({ createdAt: now - 2 * DAY }, now - DAY),
    );
  });

  it("007 lets a deployment that doesn't send expires_at still create shares", async () => {
    const db = await before007();
    await migrate(db);

    const from = Date.now();
    await db.query(
      "INSERT INTO squint_shares (id, token_hash, owner_key_hash, project, created_at, updated_at) VALUES ('bare', 'x', 'y', '{}', 1, 1)",
    );
    const to = Date.now() + 1;

    // 30 days from the insert, like a share the current code makes.
    const expiresAt = (await createPostgresStore(db).byId("bare"))?.expiresAt ?? 0;
    expect(expiresAt).toBeGreaterThanOrEqual(from + 30 * DAY);
    expect(expiresAt).toBeLessThanOrEqual(to + 30 * DAY);
    await expect(
      db.query("UPDATE squint_shares SET expires_at = NULL WHERE id = 'bare'"),
    ).rejects.toThrow(/expires_at/);
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
    expect(await storedBlobs(store)).toEqual([
      { key: "crop:same:<claim>", size: winnerCrop.length },
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
  const OLD_CLAIM = { claim: "old", cropKey: "crop:orphan:old" };

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
    await store.insertComment(RECORD.id, comment, "client", OLD_CLAIM);
    const location = { kind: "inline" as const, bytes: oldCrop };
    await store.putBlob(RECORD.id, {
      key: OLD_CLAIM.cropKey,
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
    expect(await storedBlobs(services.store)).toEqual([
      { key: "crop:orphan:<claim>", size: newCrop.length },
    ]);
    const keys = (await services.store.blobSizes(RECORD.id)).map((blob) => blob.key);
    expect(keys).not.toContain(OLD_CLAIM.cropKey);
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
    expect(await services.store.blobSizes(RECORD.id)).toEqual([
      { key: OLD_CLAIM.cropKey, size: oldCrop.length },
    ]);
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
    await services.store.insertComment(RECORD.id, fresh, "client", {
      claim: "fresh",
      cropKey: "crop:fresh:fresh",
    });
    await expireStalePending(services, RECORD, NOW);
    const left = await services.store.comments(RECORD.id, { includePending: true });
    expect(left.map((row) => row.item.id)).toEqual(["fresh"]);
    expect(await services.store.blobSizes(RECORD.id)).toEqual([]);
  });
});

/**
 * A blob backend whose first save waits until the test lets it finish (or fail):
 * a slow upload, without real waiting. Later saves go straight through.
 */
function gatedBlobs() {
  let markStarted = () => undefined as void;
  const started = new Promise<void>((resolve) => (markStarted = resolve));
  let open = (_error?: Error) => undefined as void;
  const gate = new Promise<Error | undefined>((resolve) => (open = resolve));
  let first = true;
  const blobs: BlobBackend = {
    ...inlineBackend,
    save: async (shareId, key, bytes, contentType) => {
      if (first) {
        first = false;
        markStarted();
        const error = await gate;
        if (error) throw error;
      }
      return inlineBackend.save(shareId, key, bytes, contentType);
    },
  };
  return { blobs, started, finish: () => open(), fail: (error: Error) => open(error) };
}

describe.each(stores)("%s store: an upload that outlives its claim", (_name, make) => {
  const T0 = 10_000_000;
  const LATER = T0 + PENDING_STALE_MS + 1;
  const rect = { x: 0, y: 0, width: 4, height: 4 };
  const input = { id: "slow", x: 1, y: 1, body: "Hi", author: "Cleo", crop: { rect } };
  const cropA = new Uint8Array([...PNG, 0x0a]);
  const cropB = new Uint8Array([...PNG, 0x0b]);

  /** A share whose first post (`a`, at T0) is stuck mid-upload. */
  async function stuck() {
    const gated = gatedBlobs();
    const services: ShareServices = { store: await make(), blobs: gated.blobs };
    await services.store.create(RECORD);
    const a = addClientComment(services, RECORD, input, cropA, T0);
    await gated.started;
    return { services, gated, a };
  }

  async function visibleCrop(services: ShareServices) {
    const rows = await services.store.comments(RECORD.id);
    const crop = await readBlob(services, RECORD, "crop:slow");
    return { rows: rows.map((row) => row.item.createdAt), crop: [...(crop?.bytes ?? [])] };
  }

  it("Z: expired mid-upload, it reports 409 pending (never 201) and leaves nothing", async () => {
    const { services, gated, a } = await stuck();
    await expireStalePending(services, RECORD, LATER);
    gated.finish();
    expect(await a).toMatchObject({ ok: false, status: 409, error: "pending" });
    expect(await services.store.comments(RECORD.id, { includePending: true })).toEqual([]);
    expect(await services.store.blobSizes(RECORD.id)).toEqual([]);
    // The client kept its draft; its retry posts it.
    expect(await addClientComment(services, RECORD, input, cropA, LATER)).toMatchObject({
      ok: true,
    });
    expect(await visibleCrop(services)).toEqual({ rows: [LATER], crop: [...cropA] });
  });

  it("X: reclaimed mid-upload, its failure deletes neither the retry's row nor its crop", async () => {
    const { services, gated, a } = await stuck();
    expect(await addClientComment(services, RECORD, input, cropB, LATER)).toMatchObject({
      ok: true,
    });
    gated.fail(new Error("upload timed out"));
    await expect(a).rejects.toThrow("upload timed out");
    expect(await visibleCrop(services)).toEqual({ rows: [LATER], crop: [...cropB] });
    expect(await storedBlobs(services.store)).toEqual([
      { key: "crop:slow:<claim>", size: cropB.length },
    ]);
  });

  it("Y: reclaimed mid-upload, its late success neither confirms nor overwrites the retry's crop", async () => {
    const { services, gated, a } = await stuck();
    expect(await addClientComment(services, RECORD, input, cropB, LATER)).toMatchObject({
      ok: true,
    });
    gated.finish();
    expect(await a).toMatchObject({ ok: false, status: 409, error: "pending" });
    expect(await visibleCrop(services)).toEqual({ rows: [LATER], crop: [...cropB] });
    expect(await storedBlobs(services.store)).toEqual([
      { key: "crop:slow:<claim>", size: cropB.length },
    ]);
    // A retry of the slow post learns it's already there.
    expect(await addClientComment(services, RECORD, input, cropA, LATER + 1)).toMatchObject({
      ok: false,
      status: 409,
      error: "exists",
    });
  });

  it("keeps the crop of an owner or legacy row at `crop:<id>`", async () => {
    const services: ShareServices = { store: await make(), blobs: inlineBackend };
    await services.store.create(RECORD);
    const legacy = { ...input, status: "active" as const, createdAt: T0, updatedAt: T0 };
    await services.store.insertComment(RECORD.id, legacy, "client");
    await services.store.putBlob(RECORD.id, {
      key: "crop:slow",
      contentType: "image/png",
      size: cropA.length,
      location: { kind: "inline", bytes: cropA },
    });
    expect(await visibleCrop(services)).toEqual({ rows: [T0], crop: [...cropA] });
    await expireStalePending(services, RECORD, LATER);
    expect(await services.store.blobSizes(RECORD.id)).toHaveLength(1);
  });
});

describe.each(stores)("%s store: a client capture while its image is stored", (_name, make) => {
  const T0 = 20_000_000;
  const image = (_url: URL, width: number) =>
    Promise.resolve({
      body: new Uint8Array(JPEG),
      contentType: "image/jpeg",
      width,
      height: 900,
      scale: 1,
    });

  /**
   * A share with a stale pending comment (so expiry runs a cleanup), and a capture stuck
   * mid-upload. Once the upload finishes, a cleanup runs right after the image's blob row is
   * written: inside the gap before the snapshot is confirmed.
   */
  async function capturing() {
    const gated = gatedBlobs();
    const store = await make();
    const services: ShareServices = { store, blobs: gated.blobs };
    const hooked: ShareServices = {
      ...services,
      store: {
        ...store,
        putBlob: async (id, blob) => {
          await store.putBlob(id, blob);
          await expireStalePending(services, RECORD, T0);
        },
      },
    };
    await store.create(RECORD);
    const stale = { ...COMMENT, id: "stale", createdAt: T0 - PENDING_STALE_MS - 1 };
    await store.insertComment(RECORD.id, stale, "client", { claim: "x", cropKey: "crop:stale:x" });
    const added = captureForClient(hooked, RECORD, 1024, image, T0);
    await gated.started;
    return { services, gated, added };
  }

  it("is invisible until stored, and a cleanup in the gap keeps its image", async () => {
    const { services, gated, added } = await capturing();
    expect(await services.store.snapshots(RECORD.id)).toEqual([]);
    expect((await pullChanges(services.store, RECORD, 0)).snapshots).toEqual([]);
    gated.finish();
    const result = await added;
    // The cleanup did run in the gap: it expired the stale comment.
    expect(await services.store.pendingSince(RECORD.id, "stale")).toBeNull();
    expect(result.ok).toBe(true);
    const id = result.ok ? result.value.id : "";
    expect((await pullChanges(services.store, RECORD, 0)).snapshots.map((s) => s.id)).toEqual([id]);
    const stored = await readBlob(services, RECORD, `snapshot:${id}`);
    expect([...(stored?.bytes ?? [])]).toEqual([...JPEG]);
  });

  it("is expired with its image if it outlives its request, and never reported", async () => {
    const { services, gated, added } = await capturing();
    await expireStalePending(services, RECORD, T0 + PENDING_STALE_MS + 1);
    gated.finish();
    await expect(added).rejects.toThrow("expired");
    expect(await services.store.snapshots(RECORD.id, { includePending: true })).toEqual([]);
    expect(await services.store.blobSizes(RECORD.id)).toEqual([]);
  });
});
