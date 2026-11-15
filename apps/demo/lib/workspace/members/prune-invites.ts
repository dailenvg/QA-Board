import type { Queryable } from "../../share/migrate";
import { toDate } from "../times";

/** How long an invite that ended (used, cancelled or expired) is kept before the cleanup deletes it. */
export const ENDED_INVITE_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Deletes, for the daily cleanup, invites that ended more than 30 days before
 * `now`: accepted, cancelled, or open and expired. Their addresses don't
 * linger. Answers how many it deleted.
 */
export async function pruneEndedInvites(db: Queryable, now: number): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `WITH gone AS (
       DELETE FROM workspace_invites
       WHERE accepted_at < $1 OR revoked_at < $1
         OR (accepted_at IS NULL AND revoked_at IS NULL AND expires_at < $1)
       RETURNING 1
     )
     SELECT count(*)::int AS count FROM gone`,
    [toDate(now - ENDED_INVITE_KEEP_MS)],
  );
  return rows[0]?.count ?? 0;
}
