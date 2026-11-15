import type { Queryable } from "../../share/migrate";
import { toDate } from "../times";

/**
 * How full a workspace is (043's `seat_limit`). Seats used are its members
 * whose account isn't deleted, the owner included, and its open invites that
 * haven't expired. Read under the members lock (L1, `locks.ts`) by every
 * action that takes a seat, so two can't both take the last one. Restoring an
 * account may go over the limit (decision 12); inviting waits until it's back.
 */

export interface Seats {
  used: number;
  limit: number;
}

/** Members whose account isn't deleted, the owner included. */
const ACTIVE_MEMBERS = `SELECT count(*)::int FROM memberships AS m JOIN users AS u ON u.id = m.user_id
  WHERE m.workspace_id = $1 AND u.deleted_at IS NULL`;

/** Open invites that haven't expired by `$2`. */
const HELD_BY_INVITES = `SELECT count(*)::int FROM workspace_invites
  WHERE workspace_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > $2`;

/** The seats taken in the workspace at `now`. */
export async function seatsUsed(tx: Queryable, workspaceId: string, now: number): Promise<number> {
  const { rows } = await tx.query<{ used: number }>(
    `SELECT (${ACTIVE_MEMBERS}) + (${HELD_BY_INVITES}) AS used`,
    [workspaceId, toDate(now)],
  );
  return rows[0]?.used ?? 0;
}

/** Members whose account isn't deleted: what accepting checks against the limit. */
export async function activeMembers(tx: Queryable, workspaceId: string): Promise<number> {
  const { rows } = await tx.query<{ count: number }>(`SELECT (${ACTIVE_MEMBERS}) AS count`, [
    workspaceId,
  ]);
  return rows[0]?.count ?? 0;
}

/** Seats left for new invites: never below 0, since a restore may take the workspace over. */
export function seatsLeft({ used, limit }: Seats): number {
  return Math.max(0, limit - used);
}
