import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import { COMMENT, PNG, RECORD, STATE } from "@/test/share-fixture";
import type { Database } from "../db/database";
import { inlineBackend } from "./blob-backend";
import { MIGRATIONS, migrate } from "./migrate";
import { createPostgresStore } from "./postgres-store";
import { clientShare, clientView, createShare } from "./service";

/** Every migration before 023: the schema production had when Milestone 1b shipped. */
const UP_TO_022 = MIGRATIONS.slice(0, 22);
const NEW = ["023_project_share_links", "024_projects_deleted_at", "025_workspace_blobs_inline"];

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const databases: Array<[string, () => Promise<Database>]> = [
  ["PGlite", () => Promise.resolve(adaptPglite(new PGlite()))],
  ...(TEST_DATABASE_URL
    ? [
        [
          "Postgres",
          async () => {
            const fresh = await freshSchema(TEST_DATABASE_URL as string);
            closers.push(() => fresh.close());
            return fresh.db;
          },
        ] as [string, () => Promise<Database>],
      ]
    : []),
];

/** A database at 022 holding an anonymous share and a workspace's share, its project and a file. */
async function at022(make: () => Promise<Database>) {
  const db = await make();
  expect(await migrate(db, UP_TO_022)).toHaveLength(22);
  const store = createPostgresStore(db);
  const services = { store, blobs: inlineBackend };
  const anonymous = await createShare(services, STATE, Date.now());
  await store.upsertComment(anonymous.shareId, COMMENT, "owner");
  await store.putBlob(anonymous.shareId, {
    key: "snapshot:snap-1",
    contentType: "image/png",
    size: PNG.length,
    location: { kind: "inline", bytes: PNG },
  });
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme') RETURNING id",
  );
  const workspaceId = rows[0]?.id ?? "";
  await db.query("INSERT INTO folders (workspace_id, id, name) VALUES ($1, 'f', 'F')", [
    workspaceId,
  ]);
  await db.query(
    `INSERT INTO projects (id, workspace_id, folder_id, name, source)
     VALUES ('p1', $1, 'f', 'P', '{"kind":"url","url":"https://a.test/"}')`,
    [workspaceId],
  );
  await db.query(
    `INSERT INTO squint_shares (id, token_hash, owner_key_hash, project, created_at, updated_at,
       expires_at, workspace_id, project_id)
     VALUES ($1, $2, $3, $4, 1, 1, NULL, $5, 'p1')`,
    [`${RECORD.id}-ws`, "c".repeat(64), "d".repeat(64), JSON.stringify(STATE.project), workspaceId],
  );
  await db.query(
    `INSERT INTO workspace_blobs (workspace_id, key, project_id, content_type, size, blob_url)
     VALUES ($1, 'ws/x', 'p1', 'image/png', 10, 'https://store.test/x')`,
    [workspaceId],
  );
  return { db, store, anonymous, workspaceId };
}

describe.each(databases)("migrations 023 to 025 (%s)", (_name, make) => {
  it("apply over existing shares, which keep working", async () => {
    const { db, store, anonymous, workspaceId } = await at022(make);
    expect(await migrate(db)).toEqual(NEW);
    expect(await migrate(db)).toEqual([]);
    for (const migration of MIGRATIONS.filter((m) => NEW.includes(m.id))) {
      await db.query(migration.sql);
    }

    // The anonymous share opens as before, with its comments, file and deletion date.
    const share = await clientShare(store, anonymous.token, Date.now());
    expect(share?.expiresAt).toBe(anonymous.expiresAt);
    if (!share) throw new Error("share closed");
    const view = await clientView(store, share);
    expect(view.comments).toEqual([COMMENT]);
    expect(await store.blobSizes(anonymous.shareId)).toEqual([
      { key: "snapshot:snap-1", size: PNG.length },
    ]);
    // The workspace's share reads with no deletion date (null, not 1970).
    expect((await store.byId(`${RECORD.id}-ws`))?.expiresAt).toBeNull();
    expect(await store.expiredIds(Number.MAX_SAFE_INTEGER, 10)).toEqual([anonymous.shareId]);

    // The existing file row keeps its URL; a row now holds exactly one of URL and bytes.
    const { rows } = await db.query("SELECT blob_url, bytes FROM workspace_blobs");
    expect(rows).toEqual([{ blob_url: "https://store.test/x", bytes: null }]);
    const insert = `INSERT INTO workspace_blobs
      (workspace_id, key, content_type, size, blob_url, bytes) VALUES ($1, $2, 'image/png', 1, $3, $4)`;
    await db.query(insert, [workspaceId, "ws/inline", null, PNG]);
    await expect(db.query(insert, [workspaceId, "ws/both", "https://x", PNG])).rejects.toThrow(
      /workspace_blobs_one_location/,
    );
    await expect(db.query(insert, [workspaceId, "ws/none", null, null])).rejects.toThrow(
      /workspace_blobs_one_location/,
    );

    // A trashed project's share closes; the anonymous one is untouched.
    await db.query("UPDATE projects SET deleted_at = now() WHERE id = 'p1'");
    expect(await store.byId(`${RECORD.id}-ws`)).toBeNull();
    expect(await store.byId(anonymous.shareId)).not.toBeNull();
  });

  it("links a project only to its own workspace's share of it, and cleans up after both", async () => {
    const { db, anonymous, workspaceId } = await at022(make);
    await migrate(db);
    const link = (shareId: string, projectId = "p1") =>
      db.query(
        `INSERT INTO project_share_links (workspace_id, project_id, share_id, token_sealed, owner_key_sealed)
         VALUES ($1, $2, $3, 'sealed', 'sealed')`,
        [workspaceId, projectId, shareId],
      );
    // An anonymous share isn't the workspace's share of the project.
    await expect(link(anonymous.shareId)).rejects.toThrow(/foreign key/);
    await link(`${RECORD.id}-ws`);
    await expect(link(`${RECORD.id}-ws`)).rejects.toThrow(/duplicate key|unique/);
    await db.query("DELETE FROM squint_shares WHERE id = $1", [`${RECORD.id}-ws`]);
    expect((await db.query("SELECT 1 FROM project_share_links")).rows).toEqual([]);
  });
});
