import { describe, expect, it } from "vitest";
import { STATE } from "@/test/share-fixture";
import {
  addFolder,
  NOW,
  PNG,
  TEST_AUTH_SECRET,
  twoWorkspaces,
  URL_PROJECT,
} from "@/test/workspace-fixture";
import type { Database } from "../db/database";
import { inlineBackend } from "../share/blob-backend";
import { createPostgresStore } from "../share/postgres-store";
import { createShare } from "../share/service";
import type { ClientUploadDriver, ListedFile } from "./blob-driver";
import { blobPath, brandLogoPath } from "./blob-paths";
import { storageSummary } from "./blobs";
import { TRASH_GRACE_MS, UNCOMMITTED_BLOB_MS } from "./limits";
import { createProject, getProject, listTrash, restoreProject, trashProject } from "./projects";
import { purgeProject, purgeTrash, sweepWorkspaceBlobs, type PurgeServices } from "./purge";
import { attachShare } from "./share-links";
import { storeInline } from "./uploads";

const DEADLINE = Number.MAX_SAFE_INTEGER;

/** A Vercel Blob store that lists `files` and records what's deleted. */
function fakeStore(files: ListedFile[] = []) {
  const discarded: string[] = [];
  const driver: ClientUploadDriver = {
    kind: "vercel",
    read: () => Promise.resolve(null),
    discard: (locations) => {
      for (const location of locations) {
        discarded.push(location.kind === "vercel" ? location.url : "inline");
      }
      return Promise.resolve();
    },
    head: () => Promise.resolve(null),
    handleUpload: () => Promise.reject(new Error("unused")),
    list: (prefix) =>
      Promise.resolve({
        files: files.filter((file) => file.pathname.startsWith(prefix)),
        hasMore: false,
      }),
  };
  return { driver, discarded };
}

function services(blobs: PurgeServices["blobs"]): PurgeServices {
  return { shareBlobs: inlineBackend, blobs };
}

describe("purgeTrash", () => {
  it("deletes projects trashed past the grace period, with their share, rows and files", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    for (const id of ["old", "recent", "live"]) {
      await createProject(db, a.workspaceId, URL_PROJECT(id), NOW);
      await storeInline(db, a.workspaceId, { projectId: id, key: "snapshot:s1" }, PNG);
    }
    const store = createPostgresStore(db);
    const share = await createShare({ store, blobs: inlineBackend }, STATE, NOW);
    await db.transaction((tx) =>
      attachShare(
        tx,
        a.workspaceId,
        "old",
        { shareId: share.shareId, token: share.token, ownerKey: share.ownerKey },
        NOW,
        TEST_AUTH_SECRET,
      ),
    );
    await trashProject(db, a.workspaceId, "old", NOW - TRASH_GRACE_MS - 1);
    await trashProject(db, a.workspaceId, "recent", NOW - 1);

    const { driver, discarded } = fakeStore();
    expect(await purgeTrash(db, services(driver), NOW, DEADLINE)).toEqual({
      count: 1,
      done: true,
    });
    expect((await listTrash(db, a.workspaceId)).map((project) => project.id)).toEqual(["recent"]);
    const { rows: shares } = await db.query("SELECT id FROM squint_shares");
    expect(shares).toEqual([]);
    expect(discarded).toEqual(["inline"]);
    expect(await storageSummary(db, a.workspaceId)).toMatchObject({
      blobCount: 2,
      bytes: 2 * PNG.length,
    });
  });

  it("stops at the deadline and reports it's not done", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    await createProject(db, a.workspaceId, URL_PROJECT("old"), NOW);
    await trashProject(db, a.workspaceId, "old", NOW - TRASH_GRACE_MS - 1);
    const { driver } = fakeStore();
    expect(await purgeTrash(db, services(driver), NOW, 0)).toEqual({ count: 0, done: false });
  });
});

describe("purge and restore racing", () => {
  async function trashedLongAgo() {
    const fixture = await twoWorkspaces();
    await addFolder(fixture.db, fixture.a.workspaceId);
    await createProject(fixture.db, fixture.a.workspaceId, URL_PROJECT("p1"), NOW);
    await storeInline(fixture.db, fixture.a.workspaceId, { projectId: "p1", key: "crop:c1" }, PNG);
    await trashProject(fixture.db, fixture.a.workspaceId, "p1", NOW - TRASH_GRACE_MS - 1);
    return fixture;
  }

  it("keeps a project restored after the cron listed it", async () => {
    const { db, a } = await trashedLongAgo();
    // The restore lands between the cron's list of candidates and its delete.
    const racing: Database = {
      async query(text, params) {
        const result = await db.query(text, params);
        if (text.includes("ORDER BY deleted_at, id LIMIT")) {
          await restoreProject(db, a.workspaceId, "p1");
        }
        return result as never;
      },
      transaction: (run) => db.transaction(run),
    };
    const { driver, discarded } = fakeStore();
    expect(await purgeTrash(racing, services(driver), NOW, DEADLINE)).toEqual({
      count: 0,
      done: true,
    });
    expect(await getProject(db, a.workspaceId, "p1")).toMatchObject({ id: "p1" });
    expect(await storageSummary(db, a.workspaceId)).toMatchObject({ blobCount: 1 });
    expect(discarded).toEqual([]);
  });

  it("deletes nothing that's no longer trashed, or was trashed again since the cutoff", async () => {
    const { db, a } = await trashedLongAgo();
    const { driver } = fakeStore();
    await restoreProject(db, a.workspaceId, "p1");
    expect(await purgeProject(db, services(driver), a.workspaceId, "p1")).toBe(false);
    await trashProject(db, a.workspaceId, "p1", NOW);
    const cutoff = NOW - TRASH_GRACE_MS;
    expect(await purgeProject(db, services(driver), a.workspaceId, "p1", cutoff)).toBe(false);
    expect((await listTrash(db, a.workspaceId)).map((project) => project.id)).toEqual(["p1"]);
    expect(await purgeProject(db, services(driver), a.workspaceId, "p1")).toBe(true);
    expect(await listTrash(db, a.workspaceId)).toEqual([]);
  });
});

describe("sweepWorkspaceBlobs", () => {
  it("deletes rows left without a project, and old files no row records", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    await createProject(db, a.workspaceId, URL_PROJECT("p1"), NOW);
    await createProject(db, a.workspaceId, URL_PROJECT("gone"), NOW);
    await db.query(
      `INSERT INTO workspace_blobs (workspace_id, key, project_id, content_type, size, blob_url)
       VALUES ($1, $2, 'p1', 'image/png', 10, 'https://store.test/kept'),
              ($1, $3, 'gone', 'image/png', 10, 'https://store.test/orphan')`,
      [
        a.workspaceId,
        blobPath(a.workspaceId, "p1", "page:a"),
        blobPath(a.workspaceId, "gone", "page:a"),
      ],
    );
    await db.query("DELETE FROM projects WHERE id = 'gone'");
    const old = new Date(NOW - UNCOMMITTED_BLOB_MS - 1);
    const listed = (pathname: string, url: string, uploadedAt = old) => ({
      pathname,
      url,
      uploadedAt,
    });
    const { driver, discarded } = fakeStore([
      listed(blobPath(a.workspaceId, "p1", "page:a"), "https://store.test/kept"),
      listed(blobPath(a.workspaceId, "p1", "page:never-committed"), "https://store.test/stale"),
      listed(
        blobPath(a.workspaceId, "p1", "page:uploading"),
        "https://store.test/fresh",
        new Date(NOW),
      ),
      listed(`ws/${a.workspaceId}/logo/x`, "https://store.test/logo"),
    ]);
    expect(await sweepWorkspaceBlobs(db, driver, NOW, DEADLINE)).toEqual({ count: 2, done: true });
    expect(discarded).toEqual(["https://store.test/orphan", "https://store.test/stale"]);
    const { rows } = await db.query<{ blob_url: string }>("SELECT blob_url FROM workspace_blobs");
    expect(rows).toEqual([{ blob_url: "https://store.test/kept" }]);
  });

  it("deletes old logo and avatar files no row records, and keeps recorded or recent ones", async () => {
    const { db, a } = await twoWorkspaces();
    const keptLogo = brandLogoPath(a.workspaceId, "kept");
    const keptAvatar = `user/${a.userId}/avatar/kept`;
    await db.query(
      `INSERT INTO workspace_blobs (workspace_id, key, project_id, content_type, size, blob_url)
       VALUES ($1, $2, NULL, 'image/png', 10, 'https://store.test/logo-kept')`,
      [a.workspaceId, keptLogo],
    );
    await db.query(
      `INSERT INTO user_blobs (user_id, key, content_type, size, blob_url)
       VALUES ($1, $2, 'image/png', 10, 'https://store.test/avatar-kept')`,
      [a.userId, keptAvatar],
    );
    const old = new Date(NOW - UNCOMMITTED_BLOB_MS - 1);
    // A workspace and a user deleted for good: their rows went, and their files' deletes failed.
    const goneWorkspace = "00000000-0000-4000-8000-000000000001";
    const goneUser = "00000000-0000-4000-8000-000000000002";
    const { driver, discarded } = fakeStore([
      { pathname: keptLogo, url: "https://store.test/logo-kept", uploadedAt: old },
      { pathname: keptAvatar, url: "https://store.test/avatar-kept", uploadedAt: old },
      {
        pathname: brandLogoPath(goneWorkspace, "old"),
        url: "https://store.test/logo-gone",
        uploadedAt: old,
      },
      {
        pathname: `user/${goneUser}/avatar/old`,
        url: "https://store.test/avatar-gone",
        uploadedAt: old,
      },
      {
        pathname: `user/${a.userId}/avatar/uploading`,
        url: "https://store.test/avatar-fresh",
        uploadedAt: new Date(NOW),
      },
      { pathname: `user/${a.userId}/notes/x`, url: "https://store.test/unknown", uploadedAt: old },
    ]);
    expect(await sweepWorkspaceBlobs(db, driver, NOW, DEADLINE)).toEqual({ count: 2, done: true });
    expect(discarded).toEqual(["https://store.test/logo-gone", "https://store.test/avatar-gone"]);
  });
});
