import { beforeEach, describe, expect, it } from "vitest";
import { insertUser, PASSWORD } from "@/test/accounts-fixture";
import { STATE } from "@/test/share-fixture";
import { insertSession, readSession } from "@/test/sessions-fixture";
import {
  addFolder,
  NOW,
  TEST_AUTH_SECRET,
  twoWorkspaces,
  URL_PROJECT,
  type Seat,
} from "@/test/workspace-fixture";
import { scheduleAccountDeletion } from "../account/account-deletion";
import { findMembership } from "../auth/memberships";
import { logIn } from "../auth/login";
import { completePasswordReset, isResetTokenUsable, RESET_TTL_MS } from "../auth/password-reset";
import type { Database } from "../db/database";
import { inlineBackend } from "../share/blob-backend";
import { createPostgresStore } from "../share/postgres-store";
import { clientShare, createShare, isPausedShare } from "../share/service";
import type { ShareStore } from "../share/store";
import { createProject } from "../workspace/projects";
import { attachShare } from "../workspace/share-links";
import {
  archiveWorkspace,
  createOwnerResetLink,
  setWorkspaceQuota,
  suspendWorkspace,
  unarchiveWorkspace,
  unsuspendWorkspace,
  type AdminTarget,
} from "./workspace-actions";

const ORIGIN = new URL("https://squint.example");
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

interface World {
  db: Database;
  /** Owns workspace A only. */
  a: Seat;
  /** Owns workspace B only. */
  b: Seat;
  adminId: string;
  /** A session of the admin's. */
  adminToken: string;
  /** In A and in B, with a session. */
  both: { id: string; email: string; token: string };
  /** In A only, with a password to sign in with. */
  member: { id: string; email: string; token: string };
}

async function join(db: Database, userId: string, workspaceId: string) {
  await db.query(
    "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'member')",
    [userId, workspaceId],
  );
}

async function person(db: Database, email: string, ...workspaceIds: string[]) {
  const id = await insertUser(db, email);
  for (const workspaceId of workspaceIds) await join(db, id, workspaceId);
  return { id, email, token: await insertSession(db, id, Date.now()) };
}

async function world(): Promise<World> {
  const { db, a, b } = await twoWorkspaces();
  const adminId = await insertUser(db, "admin@squint.test", "admin");
  return {
    db,
    a,
    b,
    adminId,
    adminToken: await insertSession(db, adminId, Date.now()),
    both: await person(db, "both@acme.test", a.workspaceId, b.workspaceId),
    member: await person(db, "member@acme.test", a.workspaceId),
  };
}

interface AuditRow {
  actor_user_id: string | null;
  workspace_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  meta: unknown;
}

async function adminEntries(db: Database): Promise<AuditRow[]> {
  const { rows } = await db.query<AuditRow>(
    `SELECT actor_user_id, workspace_id, action, target_type, target_id, meta
     FROM audit_log WHERE action LIKE 'admin.%' ORDER BY id`,
  );
  return rows;
}

const signIn = (db: Database, email: string, password = PASSWORD) =>
  logIn(db, { email, password, ip: "203.0.113.9" }, Date.now());

let w: World;
let target: AdminTarget;

beforeEach(async () => {
  w = await world();
  target = { adminId: w.adminId, workspaceId: w.a.workspaceId };
});

describe("setWorkspaceQuota", () => {
  it("sets the quota in bytes and records the field it changed, as the admin", async () => {
    expect(await setWorkspaceQuota(w.db, target, 2 * 1024 ** 3, NOW)).toEqual({ ok: true });
    const { rows } = await w.db.query<{ storage_quota_bytes: string }>(
      "SELECT storage_quota_bytes FROM workspaces WHERE id = $1",
      [w.a.workspaceId],
    );
    expect(Number(rows[0]?.storage_quota_bytes)).toBe(2 * 1024 ** 3);
    expect(await adminEntries(w.db)).toEqual([
      {
        actor_user_id: w.adminId,
        workspace_id: w.a.workspaceId,
        action: "admin.workspace_quota_changed",
        target_type: "workspace",
        target_id: w.a.workspaceId,
        meta: { fields: ["storage_quota_bytes"] },
      },
    ]);
  });

  it("records nothing when the quota is already that, and refuses an unknown workspace", async () => {
    expect(await setWorkspaceQuota(w.db, target, 5 * 1024 ** 3, NOW)).toEqual({ ok: true });
    expect(await adminEntries(w.db)).toEqual([]);
    expect(
      await setWorkspaceQuota(w.db, { ...target, workspaceId: UNKNOWN }, 1024 ** 3, NOW),
    ).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("suspendWorkspace", () => {
  it("signs out only the people left with no open workspace, never the admin", async () => {
    expect(await suspendWorkspace(w.db, target, NOW)).toEqual({ ok: true });
    const now = Date.now();
    const ownerToken = w.a.cookie.split("=")[1] ?? "";
    expect(await readSession(w.db, ownerToken, now)).toBeNull();
    expect(await readSession(w.db, w.member.token, now)).toBeNull();
    // In B too: keeps the session, and works in B, not in A.
    expect(await readSession(w.db, w.both.token, now)).not.toBeNull();
    expect(await findMembership(w.db, w.both.id, w.b.workspaceId)).not.toBeNull();
    expect(await findMembership(w.db, w.both.id, w.a.workspaceId)).toBeNull();
    expect(await findMembership(w.db, w.a.userId, w.a.workspaceId)).toBeNull();
    // B's owner and the admin are untouched.
    expect(await readSession(w.db, w.b.cookie.split("=")[1] ?? "", now)).not.toBeNull();
    expect(await readSession(w.db, w.adminToken, now)).not.toBeNull();
    expect(await adminEntries(w.db)).toEqual([
      expect.objectContaining({
        actor_user_id: w.adminId,
        workspace_id: w.a.workspaceId,
        action: "admin.workspace_suspended",
        target_id: w.a.workspaceId,
        meta: { fields: ["suspended_at", "sessions"] },
      }),
    ]);
  });

  it("refuses sign-in to the people it held, the same for a right password only", async () => {
    await suspendWorkspace(w.db, target, NOW);
    expect(await signIn(w.db, w.member.email)).toEqual({ ok: false, reason: "suspended" });
    // A wrong password says what it always says: nothing about the account.
    expect(await signIn(w.db, w.member.email, "wrong password!")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await signIn(w.db, "nobody@acme.test")).toEqual({ ok: false, reason: "invalid" });
    expect(await signIn(w.db, w.both.email)).toMatchObject({ ok: true });
    expect(await signIn(w.db, "admin@squint.test")).toMatchObject({ ok: true });
  });

  it("changes nothing the second time, and refuses an unknown workspace", async () => {
    await suspendWorkspace(w.db, target, NOW);
    expect(await suspendWorkspace(w.db, target, NOW)).toEqual({ ok: true });
    expect(await adminEntries(w.db)).toHaveLength(1);
    expect(await suspendWorkspace(w.db, { ...target, workspaceId: UNKNOWN }, NOW)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("names no sessions when there were none to end", async () => {
    await w.db.query("DELETE FROM sessions");
    await suspendWorkspace(w.db, target, NOW);
    expect((await adminEntries(w.db))[0]?.meta).toEqual({ fields: ["suspended_at"] });
  });
});

describe("unsuspendWorkspace", () => {
  it("opens the workspace and its people's sign-in again", async () => {
    await suspendWorkspace(w.db, target, NOW);
    expect(await unsuspendWorkspace(w.db, target, NOW)).toEqual({ ok: true });
    expect(await findMembership(w.db, w.member.id, w.a.workspaceId)).not.toBeNull();
    expect(await signIn(w.db, w.member.email)).toMatchObject({ ok: true });
    expect((await adminEntries(w.db)).map(({ action, meta }) => ({ action, meta }))).toEqual([
      { action: "admin.workspace_suspended", meta: { fields: ["suspended_at", "sessions"] } },
      { action: "admin.workspace_unsuspended", meta: { fields: ["suspended_at"] } },
    ]);
    // Again: nothing to lift, nothing recorded.
    await unsuspendWorkspace(w.db, target, NOW);
    expect(await adminEntries(w.db)).toHaveLength(2);
  });
});

describe("a suspended workspace's review links", () => {
  async function workspaceShare(store: ShareStore) {
    await addFolder(w.db, w.a.workspaceId);
    await createProject(w.db, w.a.workspaceId, URL_PROJECT("p1"), NOW);
    const created = await createShare({ store, blobs: inlineBackend }, STATE, NOW);
    const attached = await w.db.transaction((tx) =>
      attachShare(
        tx,
        w.a.workspaceId,
        "p1",
        { shareId: created.shareId, token: created.token, ownerKey: created.ownerKey },
        NOW,
        TEST_AUTH_SECRET,
      ),
    );
    expect(attached.ok).toBe(true);
    return created;
  }

  it("pause while it's suspended and open again once it's lifted", async () => {
    const store = createPostgresStore(w.db);
    const { token } = await workspaceShare(store);
    const anonymous = await createShare({ store, blobs: inlineBackend }, STATE, NOW);

    await suspendWorkspace(w.db, target, NOW);
    expect(await clientShare(store, token, NOW)).toBeNull();
    expect(await isPausedShare(store, token, NOW)).toBe(true);
    expect(await isPausedShare(store, anonymous.token, NOW)).toBe(false);
    expect(await isPausedShare(store, "not-a-token", NOW)).toBe(false);

    await unsuspendWorkspace(w.db, target, NOW);
    expect(await clientShare(store, token, NOW)).not.toBeNull();
    expect(await isPausedShare(store, token, NOW)).toBe(false);
  });

  it("are closed, not paused, once the workspace is archived too", async () => {
    const store = createPostgresStore(w.db);
    const { token } = await workspaceShare(store);
    await suspendWorkspace(w.db, target, NOW);
    await archiveWorkspace(w.db, target, NOW);
    expect(await clientShare(store, token, NOW)).toBeNull();
    expect(await isPausedShare(store, token, NOW)).toBe(false);
  });
});

describe("archiveWorkspace and unarchiveWorkspace", () => {
  it("closes the workspace without scheduling its deletion, and opens it again as it was", async () => {
    expect(await archiveWorkspace(w.db, target, NOW)).toEqual({ ok: true });
    const { rows } = await w.db.query<{ archived_at: Date | null; delete_after: Date | null }>(
      "SELECT archived_at, delete_after FROM workspaces WHERE id = $1",
      [w.a.workspaceId],
    );
    expect(rows[0]?.archived_at?.getTime()).toBe(NOW);
    expect(rows[0]?.delete_after).toBeNull();
    expect(await findMembership(w.db, w.member.id, w.a.workspaceId)).toBeNull();
    // Archiving keeps sessions and sign-in as they are: only suspending holds them.
    expect(await readSession(w.db, w.member.token, Date.now())).not.toBeNull();

    expect(await unarchiveWorkspace(w.db, target, NOW)).toEqual({ ok: true });
    expect(await findMembership(w.db, w.member.id, w.a.workspaceId)).not.toBeNull();
    expect((await adminEntries(w.db)).map(({ action, meta }) => ({ action, meta }))).toEqual([
      { action: "admin.workspace_archived", meta: { fields: ["archived_at"] } },
      { action: "admin.workspace_unarchived", meta: { fields: ["archived_at"] } },
    ]);
  });

  it("refuses a workspace its owner scheduled for deletion, and leaves that date alone", async () => {
    const deleteAfter = new Date(NOW + 30 * 24 * 60 * 60 * 1000);
    await w.db.query("UPDATE workspaces SET delete_after = $2 WHERE id = $1", [
      w.a.workspaceId,
      deleteAfter,
    ]);
    expect(await archiveWorkspace(w.db, target, NOW)).toEqual({ ok: false, reason: "deleting" });
    const { rows } = await w.db.query<{ archived_at: Date | null; delete_after: Date | null }>(
      "SELECT archived_at, delete_after FROM workspaces WHERE id = $1",
      [w.a.workspaceId],
    );
    expect(rows[0]).toEqual({ archived_at: null, delete_after: deleteAfter });
    expect(await adminEntries(w.db)).toEqual([]);
  });

  it("leaves an archived workspace's owner nothing to schedule for deletion", async () => {
    await archiveWorkspace(w.db, target, NOW);
    const { rows: owner } = await w.db.query<{ email: string }>(
      "SELECT email FROM users WHERE id = $1",
      [w.a.userId],
    );
    const user = {
      id: w.a.userId,
      email: owner[0]?.email ?? "",
      name: null,
      role: "company" as const,
    };
    expect(
      await scheduleAccountDeletion(
        w.db,
        user,
        { confirmText: "acme", currentPassword: PASSWORD, ip: "203.0.113.9" },
        NOW,
      ),
    ).toEqual({ ok: false, reason: "not-found" });
    const { rows } = await w.db.query<{ delete_after: Date | null }>(
      "SELECT delete_after FROM workspaces WHERE id = $1",
      [w.a.workspaceId],
    );
    expect(rows[0]?.delete_after).toBeNull();
  });

  it("records nothing when there's nothing to change, and refuses an unknown workspace", async () => {
    await unarchiveWorkspace(w.db, target, NOW);
    expect(await adminEntries(w.db)).toEqual([]);
    expect(await archiveWorkspace(w.db, { ...target, workspaceId: UNKNOWN }, NOW)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});

describe("createOwnerResetLink", () => {
  it("makes a link on the app's origin that the owner can use once, within the hour", async () => {
    const now = Date.now();
    const result = await createOwnerResetLink(w.db, target, { now, origin: ORIGIN });
    if (!result.ok) throw new Error(result.reason);
    expect(result.expiresAt).toBe(now + RESET_TTL_MS);
    const url = new URL(result.link);
    expect(url.origin).toBe(ORIGIN.origin);
    const token = url.pathname.replace(/^\/reset\//, "");

    expect(await isResetTokenUsable(w.db, token, now + RESET_TTL_MS - 1)).toBe(true);
    expect(await isResetTokenUsable(w.db, token, now + RESET_TTL_MS)).toBe(false);
    expect(await completePasswordReset(w.db, token, "a brand new password", now)).toBe(true);
    expect(await completePasswordReset(w.db, token, "another new password", now)).toBe(false);
    const { rows } = await w.db.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [
      w.a.userId,
    ]);
    // The owner had a placeholder hash; now they sign in with the password they chose.
    expect(await signIn(w.db, rows[0]?.email ?? "", "a brand new password")).toMatchObject({
      ok: true,
    });
  });

  it("records it against the owner, with the field's name and never the link", async () => {
    const result = await createOwnerResetLink(w.db, target, { now: NOW, origin: ORIGIN });
    if (!result.ok) throw new Error(result.reason);
    const entries = await adminEntries(w.db);
    expect(entries).toEqual([
      {
        actor_user_id: w.adminId,
        workspace_id: w.a.workspaceId,
        action: "admin.owner_reset_link_created",
        target_type: "user",
        target_id: w.a.userId,
        meta: { fields: ["password_resets"] },
      },
    ]);
    const token = new URL(result.link).pathname.split("/").at(-1) ?? "";
    expect(JSON.stringify(entries)).not.toContain(token);
  });

  it("makes no link once the owner's account is deleted, or for an unknown workspace", async () => {
    await w.db.query("UPDATE users SET deleted_at = now() WHERE id = $1", [w.a.userId]);
    expect(await createOwnerResetLink(w.db, target, { now: NOW, origin: ORIGIN })).toEqual({
      ok: false,
      reason: "no-owner",
    });
    expect(
      await createOwnerResetLink(
        w.db,
        { ...target, workspaceId: UNKNOWN },
        { now: NOW, origin: ORIGIN },
      ),
    ).toEqual({ ok: false, reason: "not-found" });
    const { rows } = await w.db.query("SELECT 1 FROM password_resets");
    expect(rows).toEqual([]);
    expect(await adminEntries(w.db)).toEqual([]);
  });
});
