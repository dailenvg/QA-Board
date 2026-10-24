import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { COMMENT, PNG, RECORD, SNAPSHOT } from "@/test/share-fixture";
import { createMemoryStore } from "./memory-store";
import { migrate, type Queryable } from "./migrate";
import { createPostgresStore } from "./postgres-store";
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
    expect(await migrate(db)).toEqual(["001_squint_shares"]);
    expect(await migrate(db)).toEqual([]);
  });
});
