import { findOwnWorkspace, type Membership } from "../auth/memberships";
import type { SessionUser } from "../auth/users";
import type { Database } from "../db/database";
import type { Queryable } from "../share/migrate";
import { lockMembers } from "../workspace/members/locks";
import { toDate } from "../workspace/times";
import { audit } from "./audit";
import { checkCurrentPassword, type CurrentPasswordCheck } from "./current-password";
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  deletionConfirmMatches,
  isWorkspaceSlug,
  workspaceNameError,
  type DeletionConfirm,
  type SessionDeletion,
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

/**
 * How long an account removed from its workspace can still come back (decision 7): an invite
 * from that workspace revives it until then, and the daily cron deletes it at its next run after.
 */
export const REMOVAL_GRACE_MS = DAY_MS;

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

/**
 * What `membership`'s user types to confirm: the workspace's name if they own
 * it, else their email; with the workspace's name either way, which the copy names.
 */
export function deletionConfirmFor(user: SessionUser, membership: Membership): DeletionConfirm {
  const workspaceName = membership.name;
  return membership.role === "owner"
    ? { kind: "workspace", text: workspaceName, workspaceName }
    : { kind: "email", text: user.email, workspaceName };
}

/** Open invites that haven't expired: what an owner's deletion cancels and says it will. */
async function openInviteCount(db: Queryable, workspaceId: string, now: number): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM workspace_invites
     WHERE workspace_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > $2`,
    [workspaceId, toDate(now)],
  );
  return rows[0]?.count ?? 0;
}

/** What the profile page shows about deleting the account; null when it can't be deleted here. */
export async function sessionDeletionConfirm(
  db: Queryable,
  user: SessionUser,
  now: number,
): Promise<SessionDeletion | null> {
  if (user.role === "admin") return null;
  const membership = await findOwnWorkspace(db, user.id);
  if (!membership) return null;
  const confirm = deletionConfirmFor(user, membership);
  if (membership.role !== "owner") return { confirm, otherMembers: false, pendingInvites: 0 };
  return {
    confirm,
    otherMembers: await hasOtherMembers(db, membership.workspaceId, user.id),
    pendingInvites: await openInviteCount(db, membership.workspaceId, now),
  };
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

/** Where an account's ways back in live: its sessions, reset links and email changes. */
export const SIGN_IN_TABLES = ["sessions", "password_resets", "email_changes"] as const;

/** Ends every way back into `userId`'s account: shared by deleting it and removing it (4.5). */
export async function endSignIns(tx: Queryable, userId: string): Promise<void> {
  for (const table of SIGN_IN_TABLES) {
    await tx.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
  }
}

/**
 * Cancels the workspace's open invites as its owner's deletion closes it
 * (A10): last, as L5, so an accept waiting on the members lock then finds the
 * workspace closed. Restoring the account leaves them cancelled.
 */
async function cancelOpenInvites(tx: Queryable, userId: string, workspaceId: string, now: number) {
  const { rows } = await tx.query<{ id: string }>(
    `UPDATE workspace_invites SET revoked_at = $2
     WHERE workspace_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
     RETURNING id`,
    [workspaceId, toDate(now)],
  );
  for (const { id } of rows) {
    await audit(
      tx,
      {
        actorUserId: userId,
        workspaceId,
        action: "member.invite_cancelled",
        target: { type: "invite", id },
        fields: ["revoked_at"],
      },
      now,
    );
  }
}

/**
 * The deletion itself, in one transaction, in the members lock order
 * (`members/locks.ts`): the workspace's members lock, so an invite accepted
 * or a member removed at the same time waits for it or it for them; then,
 * with every check made again under lock (a rename, a new member, another
 * tab), the user, then their workspace. Signs them out everywhere and voids
 * their links; keeps everything else. An owner's deletion cancels the
 * workspace's open invites. Their own deletion is never a removal, so it
 * clears any earlier one (`removed_from`).
 */
async function schedule(
  tx: Queryable,
  user: SessionUser,
  membership: Membership,
  confirmText: string,
  now: number,
): Promise<DeletionResult> {
  await lockMembers(tx, membership.workspaceId);
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
  await tx.query(
    `UPDATE users SET deleted_at = $2, delete_after = $3, removed_from = NULL,
       removed_permissions = NULL
     WHERE id = $1`,
    [user.id, toDate(now), toDate(deleteAfter)],
  );
  await endSignIns(tx, user.id);
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
    await cancelOpenInvites(tx, user.id, current.workspaceId, now);
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
 * user can sign in again with the password they had (any record of a removal,
 * `removed_from`, is cleared with the date), and the workspace they
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
    await tx.query(
      `UPDATE users SET deleted_at = NULL, delete_after = NULL, removed_from = NULL,
         removed_permissions = NULL
       WHERE id = $1`,
      [userId],
    );
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
