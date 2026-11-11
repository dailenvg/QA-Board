import type { Database } from "../db/database";
import type { Queryable } from "../share/migrate";
import { toLocation } from "../workspace/blobs";
import type { PurgeResult, PurgeServices } from "../workspace/purge";
import { toDate } from "../workspace/times";
import { discardQuietly, purgeWorkspace } from "../workspace/workspace-purge";
import { audit } from "./audit";

/**
 * The daily cron's half of deleting an account (`account-deletion.ts`
 * schedules it): once the date has come, the workspaces due go for good, then
 * the accounts. An account isn't deleted outright: its row stays, scrubbed,
 * so the audit log keeps who did what, and its email is free to use again.
 */

/** Rows per query. */
const BATCH = 50;

/** What a deleted account's email becomes: unique, and at a domain that can't receive mail. */
export function tombstoneEmail(userId: string): string {
  return `deleted+${userId}@deleted.invalid`;
}

/** No password hashes to this, so nobody can sign in with it even if the row were undeleted. */
const NO_PASSWORD = "!deleted";

/**
 * A due account (`users` row) that still owns a workspace anyone can open:
 * one restored by hand without its owner. Deleting the account would leave
 * that workspace without an owner, so it waits until the workspace is
 * resolved (deleted, or the account restored), and a later run picks it up.
 */
const OWNS_OPEN_WORKSPACE = `EXISTS (
  SELECT 1 FROM memberships AS owned JOIN workspaces AS open ON open.id = owned.workspace_id
  WHERE owned.user_id = users.id AND owned.role = 'owner' AND open.delete_after IS NULL
)`;

/**
 * Deletes an account due by `now` for good, in one transaction: its
 * memberships and avatar row go, and the row itself is scrubbed (email,
 * name, password) and loses its date, so it's never picked again or restored.
 * Its avatar's file goes once that commits. False when it was restored first,
 * or still owns an open workspace (`OWNS_OPEN_WORKSPACE`).
 */
export async function purgeAccount(
  db: Database,
  services: Pick<PurgeServices, "blobs">,
  userId: string,
  now: number,
): Promise<boolean> {
  const removed = await db.transaction(async (tx) => {
    const { rows } = await tx.query(
      `SELECT 1 FROM users WHERE id = $1 AND delete_after IS NOT NULL AND delete_after <= $2
         AND NOT ${OWNS_OPEN_WORKSPACE}
       FOR UPDATE`,
      [userId, toDate(now)],
    );
    if (rows.length === 0) return null;
    await tx.query("DELETE FROM memberships WHERE user_id = $1", [userId]);
    const { rows: files } = await tx.query<{ bytes: Uint8Array | null; blob_url: string | null }>(
      "DELETE FROM user_blobs WHERE user_id = $1 RETURNING bytes, blob_url",
      [userId],
    );
    await tx.query(
      `UPDATE users SET email = $2, name = NULL, avatar_blob_key = NULL, password_hash = $3,
         delete_after = NULL
       WHERE id = $1`,
      [userId, tombstoneEmail(userId), NO_PASSWORD],
    );
    await audit(
      tx,
      {
        actorUserId: null,
        action: "user.deleted",
        target: { type: "user", id: userId },
        fields: ["email", "name", "avatar", "password", "memberships"],
      },
      now,
    );
    return files.map(toLocation);
  });
  if (!removed) return false;
  await discardQuietly("avatar", services.blobs, removed);
  return true;
}

/**
 * Ids from `table` due to be deleted by `now`, oldest date first. Accounts
 * that still own an open workspace aren't listed, so they never fill a batch.
 */
async function dueIds(db: Queryable, table: "users" | "workspaces", now: number) {
  const held = table === "users" ? `AND NOT ${OWNS_OPEN_WORKSPACE}` : "";
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE delete_after IS NOT NULL AND delete_after <= $1 ${held}
     ORDER BY delete_after, id LIMIT $2`,
    [toDate(now), BATCH],
  );
  return rows.map((row) => row.id);
}

/** Runs `purge` on every id due in `table`, until none are left or `deadline` passes. */
async function purgeDue(
  db: Database,
  table: "users" | "workspaces",
  purge: (id: string) => Promise<boolean>,
  now: number,
  deadline: number,
): Promise<PurgeResult> {
  let count = 0;
  for (;;) {
    const ids = await dueIds(db, table, now);
    for (const id of ids) {
      if (Date.now() >= deadline) return { count, done: false };
      // Restored since the list was read: the purge skips it.
      if (await purge(id)) count += 1;
    }
    if (ids.length < BATCH) return { count, done: true };
  }
}

/**
 * Logs how many due accounts were kept because they still own an open
 * workspace: a count only, as the cron's own log, never ids or emails. The
 * audit log and `restore-account.sql` find them by `delete_after`.
 */
async function warnHeldAccounts(db: Queryable, now: number): Promise<void> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM users
     WHERE delete_after IS NOT NULL AND delete_after <= $1 AND ${OWNS_OPEN_WORKSPACE}`,
    [toDate(now)],
  );
  const count = rows[0]?.count ?? 0;
  if (count > 0) {
    console.warn(`squint purge: ${count} due account(s) kept: they still own an open workspace`);
  }
}

/**
 * Deletes for good the workspaces, then the accounts, whose date has come by
 * `now`, until `deadline`. `count` is the accounts deleted. Safe to run again:
 * each one is checked under lock, and what's done is never picked again. An
 * account that still owns an open workspace is kept, and logged.
 */
export async function purgeDeletedAccounts(
  db: Database,
  services: PurgeServices,
  now: number,
  deadline: number,
): Promise<PurgeResult> {
  const workspaces = await purgeDue(
    db,
    "workspaces",
    (id) => purgeWorkspace(db, services, id, now),
    now,
    deadline,
  );
  if (!workspaces.done) return { count: 0, done: false };
  const accounts = await purgeDue(
    db,
    "users",
    (id) => purgeAccount(db, services, id, now),
    now,
    deadline,
  );
  await warnHeldAccounts(db, now);
  return accounts;
}
