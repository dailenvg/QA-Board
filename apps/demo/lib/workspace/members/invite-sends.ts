import type { Queryable } from "../../share/migrate";
import { toDate } from "../times";

/**
 * The limit on invite emails (044's `workspace_invite_sends`): 20 a day per
 * workspace, first sends and Resends alike, in Postgres so every server
 * instance sees the same count. Claimed under the workspace's members lock
 * (L1), in the transaction that makes or renews the invites and before any
 * email goes, so a send that then fails still counts (as 038's limits do).
 * Nothing is claimed when no email will go (email off, a preview).
 */

export const INVITE_EMAIL_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_INVITE_EMAILS = 20;

export type InviteEmailClaim =
  { ok: true } | { ok: false; retryAfterSeconds: number; sentInWindow: number; limit: number };

/**
 * Claims `count` emails for the workspace at `now`, or says when all of them
 * would fit (the (limit - count + 1)-th most recent send has to age out) and
 * how many went in the last 24 hours. The caller holds L1.
 */
export async function claimInviteEmails(
  tx: Queryable,
  workspaceId: string,
  count: number,
  now: number,
): Promise<InviteEmailClaim> {
  const since = toDate(now - INVITE_EMAIL_WINDOW_MS);
  const { rows } = await tx.query<{ at: Date }>(
    "SELECT at FROM workspace_invite_sends WHERE workspace_id = $1 AND at > $2 ORDER BY at DESC",
    [workspaceId, since],
  );
  const sentInWindow = rows.length;
  if (sentInWindow + count > MAX_INVITE_EMAILS) {
    const oldest = rows[MAX_INVITE_EMAILS - count];
    const until = oldest ? new Date(oldest.at).getTime() + INVITE_EMAIL_WINDOW_MS : now;
    const wait = count > MAX_INVITE_EMAILS ? INVITE_EMAIL_WINDOW_MS : until - now;
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil(wait / 1000)),
      sentInWindow,
      limit: MAX_INVITE_EMAILS,
    };
  }
  await tx.query(
    `INSERT INTO workspace_invite_sends (workspace_id, at)
     SELECT $1, $2 FROM generate_series(1, $3::integer)`,
    [workspaceId, toDate(now), count],
  );
  return { ok: true };
}

/** Deletes sends older than a day, for the daily cleanup. Answers how many it deleted. */
export async function pruneWorkspaceInviteSends(db: Queryable, now: number): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `WITH gone AS (
       DELETE FROM workspace_invite_sends WHERE at < $1 RETURNING 1
     )
     SELECT count(*)::int AS count FROM gone`,
    [toDate(now - INVITE_EMAIL_WINDOW_MS)],
  );
  return rows[0]?.count ?? 0;
}
