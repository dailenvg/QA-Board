import { describe, expect, it } from "vitest";
import { STATE } from "@/test/share-fixture";
import {
  addFolder,
  NOW,
  TEST_AUTH_SECRET,
  twoWorkspaces,
  URL_PROJECT,
} from "@/test/workspace-fixture";
import type { Database } from "../db/database";
import { inlineBackend } from "../share/blob-backend";
import { createPostgresStore } from "../share/postgres-store";
import { clientShare, createShare } from "../share/service";
import { createProject, getProject, restoreProject, trashProject } from "./projects";
import { attachShare, getShareLink, syncShareLink } from "./share-links";

async function setup() {
  const fixture = await twoWorkspaces();
  for (const seat of [fixture.a, fixture.b]) {
    await addFolder(fixture.db, seat.workspaceId);
  }
  await createProject(fixture.db, fixture.a.workspaceId, URL_PROJECT("p1"), NOW);
  await createProject(fixture.db, fixture.a.workspaceId, URL_PROJECT("p2"), NOW);
  await createProject(fixture.db, fixture.b.workspaceId, URL_PROJECT("q1"), NOW);
  const store = createPostgresStore(fixture.db);
  const created = await createShare({ store, blobs: inlineBackend }, STATE, NOW);
  const input = { shareId: created.shareId, token: created.token, ownerKey: created.ownerKey };
  return { ...fixture, store, created, input };
}

const attach = (
  db: Database,
  workspaceId: string,
  projectId: string,
  input: Parameters<typeof attachShare>[3],
) => db.transaction((tx) => attachShare(tx, workspaceId, projectId, input, NOW, TEST_AUTH_SECRET));

describe("share links", () => {
  it("attaches an anonymous share it can prove, which then never expires on its own", async () => {
    const { db, a, store, created, input } = await setup();
    expect(
      await attach(db, a.workspaceId, "p1", { ...input, cursor: 4, lastSyncedAt: NOW }),
    ).toEqual({
      ok: true,
      value: null,
    });
    const share = await store.byId(created.shareId);
    expect(share?.expiresAt).toBeNull();
    // Long past the 30 days an anonymous share would have had, the link still opens.
    expect(await clientShare(store, created.token, NOW + 400 * 86_400_000)).not.toBeNull();
    expect(await store.expiredIds(NOW + 400 * 86_400_000, 10)).toEqual([]);

    expect(await getShareLink(db, a.workspaceId, "p1", TEST_AUTH_SECRET)).toEqual({
      id: created.shareId,
      token: created.token,
      ownerKey: created.ownerKey,
      createdAt: NOW,
      cursor: 4,
      lastSyncedAt: NOW,
    });
    expect((await getProject(db, a.workspaceId, "p1"))?.share).toEqual({
      id: created.shareId,
      createdAt: NOW,
      cursor: 4,
      lastSyncedAt: NOW,
    });
  });

  it("stores the token and owner key sealed, never in the clear", async () => {
    const { db, a, input } = await setup();
    await attach(db, a.workspaceId, "p1", input);
    const { rows } = await db.query<Record<string, unknown>>("SELECT * FROM project_share_links");
    const stored = JSON.stringify(rows);
    expect(stored).not.toContain(input.token);
    expect(stored).not.toContain(input.ownerKey);
  });

  it("refuses a wrong owner key or token, an expired share, and another workspace's share", async () => {
    const { db, a, b, input } = await setup();
    const wrong = "x".repeat(43);
    expect(await attach(db, a.workspaceId, "p1", { ...input, ownerKey: wrong })).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await attach(db, a.workspaceId, "p1", { ...input, token: wrong })).toEqual({
      ok: false,
      reason: "not-found",
    });
    const expired = await db.transaction((tx) =>
      attachShare(tx, a.workspaceId, "p1", input, NOW + 400 * 86_400_000, TEST_AUTH_SECRET),
    );
    expect(expired).toEqual({ ok: false, reason: "not-found" });
    await attach(db, a.workspaceId, "p1", input);
    // Once in workspace A, it's unknown to B, and to A's other projects.
    expect(await attach(db, b.workspaceId, "q1", input)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await attach(db, a.workspaceId, "p2", input)).toEqual({
      ok: false,
      reason: "not-found",
    });
    // Attaching it again to the same project is harmless.
    expect(await attach(db, a.workspaceId, "p1", input)).toEqual({ ok: true, value: null });
  });

  it("refuses a second share on a linked project", async () => {
    const { db, a, store, input } = await setup();
    await attach(db, a.workspaceId, "p1", input);
    const other = await createShare({ store, blobs: inlineBackend }, STATE, NOW);
    const second = { shareId: other.shareId, token: other.token, ownerKey: other.ownerKey };
    expect(await attach(db, a.workspaceId, "p1", second)).toEqual({ ok: false, reason: "linked" });
  });

  it("moves the cursor forward only", async () => {
    const { db, a, input } = await setup();
    await attach(db, a.workspaceId, "p1", input);
    expect(await syncShareLink(db, a.workspaceId, "p1", { cursor: 9, lastSyncedAt: NOW + 1 })).toBe(
      true,
    );
    expect(await syncShareLink(db, a.workspaceId, "p1", { cursor: 3, lastSyncedAt: NOW + 2 })).toBe(
      true,
    );
    expect(await getShareLink(db, a.workspaceId, "p1", TEST_AUTH_SECRET)).toMatchObject({
      cursor: 9,
      lastSyncedAt: NOW + 2,
    });
    expect(await syncShareLink(db, a.workspaceId, "p2", { cursor: 1, lastSyncedAt: NOW })).toBe(
      false,
    );
  });

  it("closes a trashed project's share until it's restored", async () => {
    const { db, a, store, created, input } = await setup();
    await attach(db, a.workspaceId, "p1", input);
    await trashProject(db, a.workspaceId, "p1", NOW);
    expect(await clientShare(store, created.token, NOW)).toBeNull();
    expect(await store.byId(created.shareId)).toBeNull();
    expect(await getShareLink(db, a.workspaceId, "p1", TEST_AUTH_SECRET)).toBeNull();
    await restoreProject(db, a.workspaceId, "p1");
    expect(await clientShare(store, created.token, NOW)).not.toBeNull();
  });

  it("closes an archived workspace's shares until it's un-archived, and no one else's", async () => {
    const { db, a, b, store, created, input } = await setup();
    await attach(db, a.workspaceId, "p1", input);
    const theirs = await createShare({ store, blobs: inlineBackend }, STATE, NOW);
    await attach(db, b.workspaceId, "q1", {
      shareId: theirs.shareId,
      token: theirs.token,
      ownerKey: theirs.ownerKey,
    });
    const anonymous = await createShare({ store, blobs: inlineBackend }, STATE, NOW);

    await db.query("UPDATE workspaces SET archived_at = now() WHERE id = $1", [a.workspaceId]);
    expect(await clientShare(store, created.token, NOW)).toBeNull();
    expect(await store.byId(created.shareId)).toBeNull();
    expect(await clientShare(store, theirs.token, NOW)).not.toBeNull();
    expect(await clientShare(store, anonymous.token, NOW)).not.toBeNull();

    await db.query("UPDATE workspaces SET archived_at = NULL WHERE id = $1", [a.workspaceId]);
    expect(await clientShare(store, created.token, NOW)).not.toBeNull();
    expect(await store.byId(created.shareId)).not.toBeNull();
  });

  it("keeps a workspace share's missing deletion date through an owner push", async () => {
    const { db, a, store, created, input } = await setup();
    await attach(db, a.workspaceId, "p1", input);
    // An owner push read the share before it was attached, and sends a date.
    await store.setProject(created.shareId, STATE.project, NOW + 1, NOW + 5);
    expect((await store.byId(created.shareId))?.expiresAt).toBeNull();
  });
});
