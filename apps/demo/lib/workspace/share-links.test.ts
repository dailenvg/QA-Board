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
import { createProject, getProject, restoreProject, setArchived, trashProject } from "./projects";
import { verifyPassword } from "../auth/password";
import {
  attachShare,
  changeSharePassword,
  changeShareSettings,
  getShareLink,
  syncShareLink,
} from "./share-links";

const HOUR = 60 * 60 * 1000;
/** A new link's window: 72 hours from its creation at `NOW`. */
const WINDOW_72 = { reviewWindowHours: 72, reviewEndsAt: NOW + 72 * HOUR };

async function inviterOf(db: Database, shareId: string): Promise<string | null> {
  const { rows } = await db.query<{ invited_by_user_id: string | null }>(
    "SELECT invited_by_user_id FROM squint_shares WHERE id = $1",
    [shareId],
  );
  return rows[0]?.invited_by_user_id ?? null;
}

/** A second member of the workspace, who could attach the link too. */
async function addMember(db: Database, workspaceId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, role) VALUES ('ben@acme.test', 'x', 'company') RETURNING id",
  );
  const userId = rows[0]?.id ?? "";
  await db.query(
    "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'member')",
    [userId, workspaceId],
  );
  return userId;
}

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
      ...WINDOW_72,
      hasPassword: false,
      passwordSetAt: null,
    });
    expect((await getProject(db, a.workspaceId, "p1"))?.share).toEqual({
      id: created.shareId,
      createdAt: NOW,
      cursor: 4,
      lastSyncedAt: NOW,
      ...WINDOW_72,
      hasPassword: false,
      passwordSetAt: null,
      clientName: null,
      invitedCount: 0,
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

  it("closes an archived project's share until it's unarchived, and keeps its secrets", async () => {
    const { db, a, store, created, input } = await setup();
    await attach(db, a.workspaceId, "p1", input);
    await setArchived(db, a.workspaceId, "p1", true, NOW);
    expect(await clientShare(store, created.token, NOW)).toBeNull();
    expect(await store.byId(created.shareId)).toBeNull();
    // Closed, not gone: the members still have the link, to reopen it by unarchiving.
    expect(await store.exists(created.shareId)).toBe(true);
    expect(await getShareLink(db, a.workspaceId, "p1", TEST_AUTH_SECRET)).toMatchObject({
      id: created.shareId,
      token: created.token,
    });
    await setArchived(db, a.workspaceId, "p1", false, NOW);
    expect(await clientShare(store, created.token, NOW)).not.toBeNull();
    expect(await store.byId(created.shareId)).not.toBeNull();
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

  it("records who attached the link, and the first inviter stays when it's attached again", async () => {
    const { db, a, created, input } = await setup();
    const ben = await addMember(db, a.workspaceId);
    await attach(db, a.workspaceId, "p1", { ...input, invitedBy: a.userId });
    expect(await inviterOf(db, created.shareId)).toBe(a.userId);
    expect(await attach(db, a.workspaceId, "p1", { ...input, invitedBy: ben })).toEqual({
      ok: true,
      value: null,
    });
    expect(await inviterOf(db, created.shareId)).toBe(a.userId);
  });

  it("takes the window chosen when attaching, and keeps it when attached again without one", async () => {
    const { db, a, store, created, input } = await setup();
    await attach(db, a.workspaceId, "p1", { ...input, reviewWindow: "24h" });
    expect(await getShareLink(db, a.workspaceId, "p1", TEST_AUTH_SECRET)).toMatchObject({
      reviewWindowHours: 24,
      reviewEndsAt: NOW + 24 * HOUR,
    });
    await attach(db, a.workspaceId, "p1", input);
    expect((await store.byId(created.shareId))?.reviewWindowHours).toBe(24);
    await attach(db, a.workspaceId, "p1", { ...input, reviewWindow: "none" });
    expect((await getProject(db, a.workspaceId, "p1"))?.share).toMatchObject({
      reviewWindowHours: null,
      reviewEndsAt: null,
      clientName: null,
    });
  });

  it("changes a link's window from its creation, and audits the field and the new window only", async () => {
    const { db, a, store, created, input } = await setup();
    await attach(db, a.workspaceId, "p1", input);
    const actor = { userId: a.userId, workspaceId: a.workspaceId };
    expect(await changeShareSettings(db, actor, "p1", { reviewWindow: "7d" }, NOW + 5)).toEqual({
      reviewWindowHours: 168,
      reviewEndsAt: NOW + 168 * HOUR,
      clientName: null,
    });
    expect((await store.byId(created.shareId))?.reviewWindowHours).toBe(168);
    expect(await changeShareSettings(db, actor, "p1", { reviewWindow: "none" }, NOW + 6)).toEqual({
      reviewWindowHours: null,
      reviewEndsAt: null,
      clientName: null,
    });
    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT actor_user_id, workspace_id, action, target_type, target_id, meta
       FROM audit_log ORDER BY id`,
    );
    expect(rows).toEqual(
      ["7d", "none"].map((reviewWindow) => ({
        actor_user_id: a.userId,
        workspace_id: a.workspaceId,
        action: "share.settings_changed",
        target_type: "project",
        target_id: "p1",
        meta: { fields: ["reviewWindow"], reviewWindow },
      })),
    );
    expect(JSON.stringify(rows)).not.toContain(created.token);
  });

  it("protects a link with a password any member may set, hashed anew every time", async () => {
    const { db, a, store, created, input } = await setup();
    await attach(db, a.workspaceId, "p1", input);
    const ben = { userId: await addMember(db, a.workspaceId), workspaceId: a.workspaceId };
    expect(await changeSharePassword(db, ben, "p1", "open sesame", NOW + 5)).toEqual({
      hasPassword: true,
      passwordSetAt: NOW + 5,
    });
    const first = (await store.byId(created.shareId))?.password;
    expect(first?.setAt).toBe(NOW + 5);
    expect(await verifyPassword("open sesame", first?.hash ?? null)).toBe(true);
    expect(await verifyPassword("open sesame ", first?.hash ?? null)).toBe(false);
    // The same password again: a new salt and time, so passes issued before stop working.
    await changeSharePassword(db, ben, "p1", "open sesame", NOW + 6);
    const second = (await store.byId(created.shareId))?.password;
    expect(second?.hash).not.toBe(first?.hash);
    expect(await getShareLink(db, a.workspaceId, "p1", TEST_AUTH_SECRET)).toMatchObject({
      hasPassword: true,
      passwordSetAt: NOW + 6,
    });
    // The workspace's own read says so too, for every member's Share dialog.
    expect((await getProject(db, a.workspaceId, "p1"))?.share).toMatchObject({
      hasPassword: true,
      passwordSetAt: NOW + 6,
    });
    expect(await changeSharePassword(db, ben, "p1", null, NOW + 7)).toEqual({
      hasPassword: false,
      passwordSetAt: null,
    });
    expect((await store.byId(created.shareId))?.password).toBeNull();
    const { rows } = await db.query<{ actor_user_id: string; action: string }>(
      "SELECT actor_user_id, action FROM audit_log ORDER BY id",
    );
    expect(rows.map((row) => row.action)).toEqual([
      "share.password_set",
      "share.password_set",
      "share.password_removed",
    ]);
    expect(rows.every((row) => row.actor_user_id === ben.userId)).toBe(true);
  });

  it("sets no password on a project without a link, in the trash, or of another workspace", async () => {
    const { db, a, b, store, created, input } = await setup();
    await attach(db, a.workspaceId, "p1", input);
    const theirs = { userId: b.userId, workspaceId: b.workspaceId };
    expect(await changeSharePassword(db, theirs, "p1", "open sesame", NOW)).toBeNull();
    const ours = { userId: a.userId, workspaceId: a.workspaceId };
    expect(await changeSharePassword(db, ours, "p2", "open sesame", NOW)).toBeNull();
    await trashProject(db, a.workspaceId, "p1", NOW);
    expect(await changeSharePassword(db, ours, "p1", "open sesame", NOW)).toBeNull();
    await db.query("UPDATE projects SET deleted_at = NULL WHERE id = 'p1'");
    expect((await store.byId(created.shareId))?.password).toBeNull();
    const { rows } = await db.query("SELECT 1 FROM audit_log");
    expect(rows).toHaveLength(0);
  });

  it("changes nothing for a project without a link, in the trash, or of another workspace", async () => {
    const { db, a, b, store, created, input } = await setup();
    await attach(db, a.workspaceId, "p1", input);
    const settings = { reviewWindow: "24h" } as const;
    const theirs = { userId: b.userId, workspaceId: b.workspaceId };
    expect(await changeShareSettings(db, theirs, "p1", settings, NOW)).toBeNull();
    const ours = { userId: a.userId, workspaceId: a.workspaceId };
    expect(await changeShareSettings(db, ours, "p2", settings, NOW)).toBeNull();
    await trashProject(db, a.workspaceId, "p1", NOW);
    expect(await changeShareSettings(db, ours, "p1", settings, NOW)).toBeNull();
    await db.query("UPDATE projects SET deleted_at = NULL WHERE id = 'p1'");
    expect((await store.byId(created.shareId))?.reviewWindowHours).toBe(72);
    const { rows } = await db.query("SELECT 1 FROM audit_log");
    expect(rows).toHaveLength(0);
  });

  it("keeps a workspace share's missing deletion date through an owner push", async () => {
    const { db, a, store, created, input } = await setup();
    await attach(db, a.workspaceId, "p1", input);
    // An owner push read the share before it was attached, and sends a date.
    await store.setProject(created.shareId, STATE.project, NOW + 1, NOW + 5);
    expect((await store.byId(created.shareId))?.expiresAt).toBeNull();
  });
});
