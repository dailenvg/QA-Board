import type { Database } from "../db/database";
import type { Queryable } from "./migrate";

/**
 * The rate limits on invitation emails (038), shared by every server instance
 * through Postgres: 30 addresses per workspace and 20 per member in an hour,
 * counted per address sent. A send that would go over waits whole: none of
 * its addresses go, and it says when all of them could.
 */

export const INVITE_WINDOW_MS = 60 * 60 * 1000;
export const MAX_INVITES_PER_WORKSPACE = 30;
export const MAX_INVITES_PER_MEMBER = 20;
/** Sends older than this are deleted; well past the window. */
const KEEP_SENDS_MS = 24 * 60 * 60 * 1000;

export interface InviteSender {
  workspaceId: string;
  userId: string;
}

export type InviteClaim = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * When enough of the sends matching `filter` in the window age out for
 * `count` more to fit under `limit` (epoch ms), or null when they fit now:
 * the (limit - count + 1)-th most recent one has to go.
 */
async function blockedUntil(
  tx: Queryable,
  filter: string,
  value: string,
  limit: number,
  count: number,
  now: number,
): Promise<number | null> {
  if (count > limit) return now + INVITE_WINDOW_MS;
  const { rows } = await tx.query<{ at: Date }>(
    `SELECT at FROM squint_share_invite_sends WHERE ${filter} = $1 AND at > $2
     ORDER BY at DESC OFFSET $3 LIMIT 1`,
    [value, new Date(now - INVITE_WINDOW_MS), limit - count],
  );
  return rows[0] ? new Date(rows[0].at).getTime() + INVITE_WINDOW_MS : null;
}

/**
 * Claims `count` invitation emails before they're sent, so the limits hold
 * however many sends arrive at once: under transaction-scoped advisory locks
 * on the workspace, then the member (always in that order), it counts the
 * hour's sends, then refuses (with when to retry) or records one row per
 * address. A claim stays even if the email then fails: retrying a failed send
 * counts again.
 */
export function claimInviteSends(
  db: Database,
  sender: InviteSender,
  count: number,
  now: number,
): Promise<InviteClaim> {
  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `squint:share-invites:workspace:${sender.workspaceId}`,
    ]);
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `squint:share-invites:user:${sender.userId}`,
    ]);
    const byWorkspace = await blockedUntil(
      tx,
      "workspace_id",
      sender.workspaceId,
      MAX_INVITES_PER_WORKSPACE,
      count,
      now,
    );
    const byMember = await blockedUntil(
      tx,
      "user_id",
      sender.userId,
      MAX_INVITES_PER_MEMBER,
      count,
      now,
    );
    const until = Math.max(byWorkspace ?? 0, byMember ?? 0);
    if (until > now) return { ok: false, retryAfterSeconds: Math.ceil((until - now) / 1000) };
    await tx.query(
      `INSERT INTO squint_share_invite_sends (workspace_id, user_id, at)
       SELECT $1, $2, $3 FROM generate_series(1, $4::integer)`,
      [sender.workspaceId, sender.userId, new Date(now), count],
    );
    return { ok: true };
  });
}

/** Deletes sends older than a day, for the daily cleanup. Answers how many it deleted. */
export async function pruneInviteSends(db: Queryable, now: number): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `WITH gone AS (
       DELETE FROM squint_share_invite_sends WHERE at < $1 RETURNING 1
     )
     SELECT count(*)::int AS count FROM gone`,
    [new Date(now - KEEP_SENDS_MS)],
  );
  return rows[0]?.count ?? 0;
}
