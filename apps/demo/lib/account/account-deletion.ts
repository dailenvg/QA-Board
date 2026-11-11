import { findOwnWorkspace, type Membership } from "../auth/memberships";
import type { SessionUser } from "../auth/users";
import type { Database } from "../db/database";
import type { Queryable } from "../share/migrate";
import { toDate } from "../workspace/times";
import { audit } from "./audit";
import { checkCurrentPassword, type CurrentPasswordCheck } from "./current-password";
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  deletionConfirmMatches,
  isWorkspaceSlug,
  workspaceNameError,
  type DeletionConfirm,
} from "./field-rules";

/**
 * Deleting an account from /account/profile, and undoing it. Deleting
 * schedules: the user can't sign in from then on, and is deleted for good
 * `ACCOUNT_DELETION_GRACE_MS` later by the daily cron (`account-purge.ts`),
 * with the workspace they own alone. Until then nothing is lost, so
 * `restoreAccount` (or `restore-account.sql`, by hand) brings it all back,
 * except to a member whose workspace is being deleted too: they get a new one.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a deleted account (and the workspace it owned alone) can still be restored. */
export const ACCOUNT_DELETION_GRACE_MS = ACCOUNT_DELETION_GRACE_DAYS * DAY_MS;

/** Why an account can't be deleted from its own settings. */
export type DeletionRefusal =
  /** The admin's account isn't deleted from here. */
  | "admin-account"
  /** No open workspace to delete it from (archived, or none). */
  | "not-found"
  /** The workspace's owner, while it has other members who aren't deleted themselves. */
  | "owner-has-members"
  | "confirm-mismatch";

export interface ScheduledDeletion {
  /** Where the notice goes: the address the account had. */
  email: string;
  /** When it's deleted for good (epoch ms). */
  deleteAfter: number;
  /** The workspace deleted with it, when they owned it; null for a member. */
  workspaceName: string | null;
}

export type DeletionResult =
  /** `scheduled` is null when another request deleted the account first. */
  | { ok: true; scheduled: ScheduledDeletion | null }
  | { ok: false; reason: DeletionRefusal }
  | Exclude<CurrentPasswordCheck, { ok: true }>;

export interface DeletionRequest {
  confirmText: string;
  currentPassword: string;
  /** The caller's address, for the sign-in budget. */
  ip: string;
}

/** What `membership`'s user types to confirm: the workspace's name if they own it, else their email. */
export function deletionConfirmFor(user: SessionUser, membership: Membership): DeletionConfirm {
  return membership.role === "owner"
    ? { kind: "workspace", text: membership.name }
    : { kind: "email", text: user.email };
}

/** What the profile page asks the signed-in user to type; null when they can't delete it here. */
export async function sessionDeletionConfirm(
  db: Queryable,
  user: SessionUser,
): Promise<DeletionConfirm | null> {
  if (user.role === "admin") return null;
  const membership = await findOwnWorkspace(db, user.id);
  return membership && deletionConfirmFor(user, membership);
}

/** Whether anyone but `userId` still belongs to the workspace: deleted accounts don't count. */
async function hasOtherMembers(db: Queryable, workspaceId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT 1 FROM memberships AS m JOIN users AS u ON u.id = m.user_id
     WHERE m.workspace_id = $1 AND m.user_id <> $2 AND u.deleted_at IS NULL LIMIT 1`,
    [workspaceId, userId],
  );
  return rows.length > 0;
}

/** Checks done before the password, so a mistake costs nothing from the sign-in budget. */
async function precheck(
  db: Queryable,
  user: SessionUser,
  confirmText: string,
): Promise<{ ok: true; membership: Membership } | { ok: false; reason: DeletionRefusal }> {
  if (user.role === "admin") return { ok: false, reason: "admin-account" };
  const membership = await findOwnWorkspace(db, user.id);
  if (!membership) return { ok: false, reason: "not-found" };
  if (!deletionConfirmMatches(confirmText, deletionConfirmFor(user, membership))) {
    return { ok: false, reason: "confirm-mismatch" };
  }
  if (membership.role === "owner" && (await hasOtherMembers(db, membership.workspaceId, user.id))) {
    return { ok: false, reason: "owner-has-members" };
  }
  return { ok: true, membership };
}

/**
 * The membership again, under lock: the workspace's usage row, then the
 * workspace itself, in the order uploads take them, so an upload either lands
 * first or finds the workspace closed. Null once it's gone or closed.
 */
async function lockMembership(
  tx: Queryable,
  userId: string,
  workspaceId: string,
): Promise<Pick<Membership, "name" | "role"> | null> {
  await tx.query("SELECT 1 FROM storage_usage WHERE workspace_id = $1 FOR UPDATE", [workspaceId]);
  const { rows } = await tx.query<Pick<Membership, "name" | "role">>(
    `SELECT w.name, m.role FROM memberships AS m JOIN workspaces AS w ON w.id = m.workspace_id
     WHERE m.user_id = $1 AND m.workspace_id = $2
       AND w.archived_at IS NULL AND w.delete_after IS NULL
     FOR UPDATE OF w`,
    [userId, workspaceId],
  );
  return rows[0] ?? null;
}

const SIGN_IN_TABLES = ["sessions", "password_resets", "email_changes"] as const;

/**
 * The deletion itself, in one transaction, with every check made again under
 * lock (a rename, a new member, another tab): the user, then their workspace.
 * Signs them out everywhere and voids their links; keeps everything else.
 */
async function schedule(
  tx: Queryable,
  user: SessionUser,
  membership: Membership,
  confirmText: string,
  now: number,
): Promise<DeletionResult> {
  const { rows: users } = await tx.query<{ email: string }>(
    "SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
    [user.id],
  );
  const account = users[0];
  if (!account) return { ok: true, scheduled: null };
  const locked = await lockMembership(tx, user.id, membership.workspaceId);
  if (!locked) return { ok: false, reason: "not-found" };
  const current = { ...membership, ...locked };
  if (!deletionConfirmMatches(confirmText, deletionConfirmFor(user, current))) {
    return { ok: false, reason: "confirm-mismatch" };
  }
  const owns = current.role === "owner";
  if (owns && (await hasOtherMembers(tx, current.workspaceId, user.id))) {
    return { ok: false, reason: "owner-has-members" };
  }
  const deleteAfter = now + ACCOUNT_DELETION_GRACE_MS;
  await tx.query("UPDATE users SET deleted_at = $2, delete_after = $3 WHERE id = $1", [
    user.id,
    toDate(now),
    toDate(deleteAfter),
  ]);
  for (const table of SIGN_IN_TABLES) {
    await tx.query(`DELETE FROM ${table} WHERE user_id = $1`, [user.id]);
  }
  const target = { type: "user", id: user.id } as const;
  const fields = ["deleted_at", "delete_after", ...SIGN_IN_TABLES];
  await audit(tx, { actorUserId: user.id, action: "user.deletion_scheduled", target, fields }, now);
  if (owns) {
    await tx.query("UPDATE workspaces SET delete_after = $2 WHERE id = $1", [
      current.workspaceId,
      toDate(deleteAfter),
    ]);
    await audit(
      tx,
      {
        actorUserId: user.id,
        workspaceId: current.workspaceId,
        action: "workspace.deletion_scheduled",
        target: { type: "workspace", id: current.workspaceId },
        fields: ["delete_after"],
      },
      now,
    );
  }
  return {
    ok: true,
    scheduled: { email: account.email, deleteAfter, workspaceName: owns ? current.name : null },
  };
}

/**
 * Deletes the signed-in user's account once they've typed what
 * `deletionConfirmFor` asks and their current password checks out
 * (`checkCurrentPassword`, against the sign-in budget). Never the admin's.
 * An owner's workspace goes with it, but only while nobody else is in it.
 */
export async function scheduleAccountDeletion(
  db: Database,
  user: SessionUser,
  { confirmText, currentPassword, ip }: DeletionRequest,
  now: number,
): Promise<DeletionResult> {
  const checked = await precheck(db, user, confirmText);
  if (!checked.ok) return checked;
  const password = await checkCurrentPassword(db, user, currentPassword, ip, now);
  if (!password.ok) return password;
  return db.transaction((tx) => schedule(tx, user, checked.membership, confirmText, now));
}

/** The workspace a restored member gets when theirs is being deleted too. */
export interface NewWorkspace {
  name: string;
  slug: string;
}

/** Why an account wasn't restored. Nothing changed. */
export type RestoreRefusal =
  /** The member needs a new workspace, and no `NewWorkspace` was given. */
  | "workspace-missing"
  /** Its name or slug breaks the rules (`workspaceNameError`, `isWorkspaceSlug`). */
  | "workspace-invalid"
  /** Another workspace has its slug. */
  | "slug-taken";

export interface RestoredAccount {
  /** The workspace made for a member whose own is being deleted; null otherwise. */
  newWorkspaceId: string | null;
}

/** `restored` is null when there was nothing to restore. */
export type RestoreResult =
  { ok: true; restored: RestoredAccount | null } | { ok: false; reason: RestoreRefusal };

/**
 * The workspaces `userId` is a member of (not the owner) that are waiting to
 * be deleted, locked: restoring them doesn't reopen those, so they leave
 * them for a new workspace of their own.
 */
async function lockClosingMemberships(tx: Queryable, userId: string): Promise<string[]> {
  const { rows } = await tx.query<{ workspace_id: string }>(
    `SELECT m.workspace_id FROM memberships AS m JOIN workspaces AS w ON w.id = m.workspace_id
     WHERE m.user_id = $1 AND m.role = 'member' AND w.delete_after IS NOT NULL
     ORDER BY m.workspace_id
     FOR UPDATE OF m, w`,
    [userId],
  );
  return rows.map((row) => row.workspace_id);
}

/** Creates `workspace`, empty and with 009's defaults, or says why not: nothing written then. */
async function createWorkspace(
  tx: Queryable,
  workspace: NewWorkspace | undefined,
): Promise<{ ok: true; id: string } | { ok: false; reason: RestoreRefusal }> {
  if (!workspace) return { ok: false, reason: "workspace-missing" };
  const name = workspace.name.trim();
  const slug = workspace.slug.trim();
  if (workspaceNameError(name) !== null || !isWorkspaceSlug(slug)) {
    return { ok: false, reason: "workspace-invalid" };
  }
  const { rows } = await tx.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING RETURNING id",
    [slug, name],
  );
  const id = rows[0]?.id;
  return id ? { ok: true, id } : { ok: false, reason: "slug-taken" };
}

/** Opens again the workspaces `userId` owned, waiting to be deleted with them. */
async function reopenOwnedWorkspaces(
  tx: Queryable,
  userId: string,
  now: number,
  actorUserId: string | null,
): Promise<void> {
  const { rows } = await tx.query<{ id: string }>(
    `UPDATE workspaces AS w SET delete_after = NULL FROM memberships AS m
     WHERE m.workspace_id = w.id AND m.user_id = $1 AND m.role = 'owner'
       AND w.delete_after > $2
     RETURNING w.id`,
    [userId, toDate(now)],
  );
  for (const { id } of rows) {
    await audit(
      tx,
      {
        actorUserId,
        workspaceId: id,
        action: "workspace.restored",
        target: { type: "workspace", id },
        fields: ["delete_after"],
      },
      now,
    );
  }
}

/**
 * Makes `userId` the owner of the workspace just created for them, and takes
 * them out of the closing ones, which are still deleted on their date.
 */
async function moveToNewWorkspace(
  tx: Queryable,
  userId: string,
  { workspaceId, closing }: { workspaceId: string; closing: readonly string[] },
  now: number,
  actorUserId: string | null,
): Promise<void> {
  const member = { type: "user", id: userId } as const;
  const workspace = { type: "workspace", id: workspaceId } as const;
  const fields = ["membership"];
  await audit(
    tx,
    {
      actorUserId,
      workspaceId,
      action: "workspace.created",
      target: workspace,
      fields: ["workspace"],
    },
    now,
  );
  await tx.query("INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'owner')", [
    userId,
    workspaceId,
  ]);
  await audit(
    tx,
    { actorUserId, workspaceId, action: "membership.added", target: member, fields },
    now,
  );
  await tx.query("DELETE FROM memberships WHERE user_id = $1 AND workspace_id = ANY($2)", [
    userId,
    [...closing],
  ]);
  for (const id of closing) {
    await audit(
      tx,
      { actorUserId, workspaceId: id, action: "membership.removed", target: member, fields },
      now,
    );
  }
}

/**
 * Undoes a deletion while it can still be undone (its date hasn't come): the
 * user can sign in again with the password they had, and the workspace they
 * owned opens again with its share links. A member whose workspace is being
 * deleted too doesn't reopen it: they leave it for `newWorkspace`, empty and
 * theirs, required then and ignored otherwise. `actorUserId` is whoever
 * restored it (the admin, from M4's panel); null by default. The same as
 * `restore-account.sql`, which the admin runs by hand until then.
 */
export async function restoreAccount(
  db: Database,
  userId: string,
  now: number,
  actorUserId: string | null = null,
  newWorkspace?: NewWorkspace,
): Promise<RestoreResult> {
  return db.transaction(async (tx): Promise<RestoreResult> => {
    const { rows } = await tx.query(
      "SELECT 1 FROM users WHERE id = $1 AND delete_after > $2 FOR UPDATE",
      [userId, toDate(now)],
    );
    if (rows.length === 0) return { ok: true, restored: null };
    const closing = await lockClosingMemberships(tx, userId);
    const created = closing.length > 0 ? await createWorkspace(tx, newWorkspace) : null;
    if (created && !created.ok) return created;
    await tx.query("UPDATE users SET deleted_at = NULL, delete_after = NULL WHERE id = $1", [
      userId,
    ]);
    const target = { type: "user", id: userId } as const;
    const fields = ["deleted_at", "delete_after"];
    await audit(tx, { actorUserId, action: "user.restored", target, fields }, now);
    await reopenOwnedWorkspaces(tx, userId, now, actorUserId);
    if (created) {
      await moveToNewWorkspace(tx, userId, { workspaceId: created.id, closing }, now, actorUserId);
    }
    return { ok: true, restored: { newWorkspaceId: created?.id ?? null } };
  });
}
