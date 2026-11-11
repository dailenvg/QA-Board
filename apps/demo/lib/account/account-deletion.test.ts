import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { NOW, PASSWORD } from "@/test/accounts-fixture";
import {
  addMember,
  countRows,
  deletionWorld,
  OWNER_EMAIL,
  WORKSPACE_NAME,
  type DeletionWorld,
} from "@/test/deletion-fixture";
import { PNG } from "@/test/workspace-fixture";
import { logIn } from "../auth/login";
import { findMembership, findOwnWorkspace } from "../auth/memberships";
import { isResetTokenUsable, requestPasswordReset } from "../auth/password-reset";
import { readSession } from "../auth/sessions";
import type { SessionUser } from "../auth/users";
import { createPostgresStore } from "../share/postgres-store";
import { createSecret, hashSecret } from "../share/tokens";
import { clientShare } from "../share/service";
import { storeInline } from "../workspace/uploads";
import {
  ACCOUNT_DELETION_GRACE_MS,
  restoreAccount,
  scheduleAccountDeletion,
  sessionDeletionConfirm,
} from "./account-deletion";

const IP = "203.0.113.9";
const DAY_MS = 24 * 60 * 60 * 1000;

let world: DeletionWorld;

beforeEach(async () => {
  world = await deletionWorld();
});

const remove = (user: SessionUser, confirmText: string, currentPassword = PASSWORD, now = NOW) =>
  scheduleAccountDeletion(world.db, user, { confirmText, currentPassword, ip: IP }, now);

async function userRow(id: string) {
  const { rows } = await world.db.query<{
    email: string;
    password_hash: string;
    avatar_blob_key: string | null;
    deleted_at: Date | null;
    delete_after: Date | null;
  }>(
    "SELECT email, password_hash, avatar_blob_key, deleted_at, delete_after FROM users WHERE id = $1",
    [id],
  );
  return rows[0];
}

async function workspaceDeleteAfter(id: string): Promise<number | null> {
  const { rows } = await world.db.query<{ delete_after: Date | null }>(
    "SELECT delete_after FROM workspaces WHERE id = $1",
    [id],
  );
  return rows[0]?.delete_after ? new Date(rows[0].delete_after).getTime() : null;
}

async function auditActions() {
  const { rows } = await world.db.query<{
    action: string;
    actor_user_id: string | null;
    workspace_id: string | null;
  }>("SELECT action, actor_user_id, workspace_id FROM audit_log ORDER BY id");
  return rows;
}

async function loginAttempts(): Promise<number> {
  const { rows } = await world.db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM login_attempts",
  );
  return rows[0]?.count ?? 0;
}

describe("scheduleAccountDeletion", () => {
  it("schedules an owner's account and workspace 30 days out, signing out and voiding links only", async () => {
    const { db, owner, workspaceId } = world;
    await db.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, repeat('a', 64), now() + interval '1 hour')`,
      [owner.id],
    );
    await db.query(
      `INSERT INTO email_changes (user_id, new_email, token_hash, expires_at)
       VALUES ($1, 'new@acme.test', repeat('b', 64), now() + interval '1 hour')`,
      [owner.id],
    );
    const before = await userRow(owner.id);

    const result = await remove(owner, `  ${WORKSPACE_NAME} `);

    const deleteAfter = NOW + ACCOUNT_DELETION_GRACE_MS;
    expect(result).toEqual({
      ok: true,
      scheduled: { email: OWNER_EMAIL, deleteAfter, workspaceName: WORKSPACE_NAME },
    });
    const after = await userRow(owner.id);
    expect(after?.deleted_at && new Date(after.deleted_at).getTime()).toBe(NOW);
    expect(after?.delete_after && new Date(after.delete_after).getTime()).toBe(deleteAfter);
    expect(await workspaceDeleteAfter(workspaceId)).toBe(deleteAfter);
    for (const table of ["sessions", "password_resets", "email_changes"]) {
      expect(await countRows(db, table, "user_id", owner.id)).toBe(0);
    }
    // Everything a restore needs stays as it was.
    expect(after).toMatchObject({
      email: before?.email,
      password_hash: before?.password_hash,
      avatar_blob_key: before?.avatar_blob_key,
    });
    expect(await countRows(db, "memberships", "user_id", owner.id)).toBe(1);
    expect(await countRows(db, "user_blobs", "user_id", owner.id)).toBe(1);
    expect(await countRows(db, "workspace_blobs", "workspace_id", workspaceId)).toBe(2);
    expect(await countRows(db, "projects", "workspace_id", workspaceId)).toBe(1);
    expect(await countRows(db, "squint_shares", "workspace_id", workspaceId)).toBe(1);
    expect(await auditActions()).toEqual([
      { action: "user.deletion_scheduled", actor_user_id: owner.id, workspace_id: null },
      {
        action: "workspace.deletion_scheduled",
        actor_user_id: owner.id,
        workspace_id: workspaceId,
      },
    ]);
  });

  it("leaves the other workspace and its owner alone", async () => {
    const { db, owner, other } = world;
    await remove(owner, WORKSPACE_NAME);
    expect(await workspaceDeleteAfter(other.workspaceId)).toBeNull();
    expect((await userRow(other.userId))?.deleted_at).toBeNull();
    expect(await countRows(db, "sessions", "user_id", other.userId)).toBe(1);
  });

  it("asks a member for their own email, in any case, and leaves the workspace open", async () => {
    const { db, workspaceId } = world;
    const memberId = await addMember(db, workspaceId, "bo@acme.test");
    const member: SessionUser = {
      id: memberId,
      email: "bo@acme.test",
      name: null,
      role: "company",
    };
    expect(await sessionDeletionConfirm(db, member)).toEqual({
      kind: "email",
      text: "bo@acme.test",
    });
    expect(await remove(member, WORKSPACE_NAME)).toEqual({
      ok: false,
      reason: "confirm-mismatch",
    });
    const result = await remove(member, " BO@acme.test ");
    expect(result).toMatchObject({ ok: true, scheduled: { workspaceName: null } });
    expect(await workspaceDeleteAfter(workspaceId)).toBeNull();
    expect(await countRows(db, "memberships", "user_id", memberId)).toBe(1);
    expect((await auditActions()).map((entry) => entry.action)).toEqual([
      "user.deletion_scheduled",
    ]);
  });

  it("refuses an owner while someone else still works in the workspace, but not for deleted members", async () => {
    const { db, owner, workspaceId } = world;
    const memberId = await addMember(db, workspaceId, "bo@acme.test");
    expect(await remove(owner, WORKSPACE_NAME)).toEqual({
      ok: false,
      reason: "owner-has-members",
    });
    expect(await loginAttempts()).toBe(0);
    await db.query("UPDATE users SET deleted_at = now() WHERE id = $1", [memberId]);
    expect(await remove(owner, WORKSPACE_NAME)).toMatchObject({ ok: true });
  });

  it("refuses the admin before the password is checked", async () => {
    const admin: SessionUser = { ...world.owner, role: "admin" };
    expect(await sessionDeletionConfirm(world.db, admin)).toBeNull();
    expect(await remove(admin, WORKSPACE_NAME)).toEqual({ ok: false, reason: "admin-account" });
    expect(await loginAttempts()).toBe(0);
    expect((await userRow(admin.id))?.deleted_at).toBeNull();
  });

  it("costs nothing from the sign-in budget for a typo, and counts a wrong password", async () => {
    const { owner } = world;
    expect(await remove(owner, "Acme")).toEqual({ ok: false, reason: "confirm-mismatch" });
    expect(await remove(owner, WORKSPACE_NAME.toLowerCase())).toEqual({
      ok: false,
      reason: "confirm-mismatch",
    });
    expect(await loginAttempts()).toBe(0);
    expect(await remove(owner, WORKSPACE_NAME, "wrong password")).toEqual({
      ok: false,
      reason: "wrong-password",
    });
    expect(await loginAttempts()).toBe(1);
    expect((await userRow(owner.id))?.deleted_at).toBeNull();
  });

  it("refuses without an open workspace", async () => {
    const { db, owner, workspaceId } = world;
    await db.query("UPDATE workspaces SET archived_at = now() WHERE id = $1", [workspaceId]);
    expect(await sessionDeletionConfirm(db, owner)).toBeNull();
    expect(await remove(owner, WORKSPACE_NAME)).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("while a deletion is scheduled", () => {
  beforeEach(async () => {
    await remove(world.owner, WORKSPACE_NAME);
  });

  it("treats the account as gone: no sign-in, no session, no reset link", async () => {
    const { db, owner } = world;
    expect(await logIn(db, { email: OWNER_EMAIL, password: PASSWORD, ip: IP }, NOW)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await readSession(db, world.cookie.split("=")[1] ?? "", NOW)).toBeNull();
    const sent: string[] = [];
    const send = (email: { to: string }) => {
      sent.push(email.to);
      return Promise.resolve();
    };
    await requestPasswordReset(db, OWNER_EMAIL, {
      now: NOW,
      origin: new URL("https://squint.test"),
      send,
    });
    expect(sent).toEqual([]);
    // A link that somehow outlived the deletion still can't set a password.
    const token = createSecret();
    await db.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [owner.id, hashSecret(token), new Date(NOW + DAY_MS)],
    );
    expect(await isResetTokenUsable(db, token, NOW)).toBe(false);
  });

  it("closes the workspace to everyone, its uploads included", async () => {
    const { db, workspaceId } = world;
    const memberId = await addMember(db, workspaceId, "late@acme.test");
    expect(await findMembership(db, memberId, workspaceId)).toBeNull();
    expect(await findOwnWorkspace(db, memberId)).toBeNull();
    expect(await storeInline(db, workspaceId, { projectId: "p1", key: "crop:c2" }, PNG)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("answers its share links as revoked, brand and logo included", async () => {
    const store = createPostgresStore(world.db);
    expect(await clientShare(store, world.share.token, NOW)).toBeNull();
    expect(await store.byId(world.share.shareId)).toBeNull();
    expect((await store.brandOf(world.share.shareId)).custom).toBe(false);
    expect(await store.brandLogo(world.share.shareId)).toBeNull();
  });

  it("keeps the email and the slug taken", async () => {
    await expect(
      world.db.query("INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'company')", [
        OWNER_EMAIL,
      ]),
    ).rejects.toThrow();
    await expect(
      world.db.query("INSERT INTO workspaces (slug, name) VALUES ('acme', 'Another')"),
    ).rejects.toThrow();
  });
});

describe("restoreAccount", () => {
  it("brings the account, its workspace and its share links back, and records it", async () => {
    const { db, owner, workspaceId, share } = world;
    await remove(owner, WORKSPACE_NAME);
    expect(await restoreAccount(db, owner.id, NOW + DAY_MS, world.other.userId)).toBe(true);
    expect((await userRow(owner.id))?.deleted_at).toBeNull();
    expect(await workspaceDeleteAfter(workspaceId)).toBeNull();
    const signedIn = await logIn(db, { email: OWNER_EMAIL, password: PASSWORD, ip: IP }, NOW);
    expect(signedIn.ok).toBe(true);
    expect(await clientShare(createPostgresStore(db), share.token, NOW)).not.toBeNull();
    expect((await auditActions()).slice(2)).toEqual([
      { action: "user.restored", actor_user_id: world.other.userId, workspace_id: null },
      {
        action: "workspace.restored",
        actor_user_id: world.other.userId,
        workspace_id: workspaceId,
      },
    ]);
  });

  it("restores nothing once the date has come, nor an account that was never deleted", async () => {
    const { db, owner } = world;
    expect(await restoreAccount(db, owner.id, NOW)).toBe(false);
    await remove(owner, WORKSPACE_NAME);
    expect(await restoreAccount(db, owner.id, NOW + ACCOUNT_DELETION_GRACE_MS)).toBe(false);
    expect((await userRow(owner.id))?.deleted_at).not.toBeNull();
  });
});

describe("restore-account.sql", () => {
  const sql = readFileSync(new URL("./restore-account.sql", import.meta.url), "utf8");
  const forEmail = (email: string) => sql.replace("'person@example.com'", `'${email}'`);

  it("does what restoreAccount does, by email", async () => {
    const { db, owner, workspaceId } = world;
    // The script compares with the database's clock: schedule from now, not the fixed test time.
    await scheduleAccountDeletion(
      db,
      owner,
      { confirmText: WORKSPACE_NAME, currentPassword: PASSWORD, ip: IP },
      Date.now(),
    );
    const { rows } = await db.query<{ action: string }>(forEmail(" Ana@ACME.test "));
    expect(rows.map((row) => row.action)).toEqual(["user.restored", "workspace.restored"]);
    expect((await userRow(owner.id))?.deleted_at).toBeNull();
    expect(await workspaceDeleteAfter(workspaceId)).toBeNull();
    expect(await db.query(forEmail(OWNER_EMAIL))).toEqual({ rows: [] });
  });
});
