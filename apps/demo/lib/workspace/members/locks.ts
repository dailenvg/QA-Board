import type { Membership } from "../../auth/memberships";
import { knownSwitches, type Access } from "../../auth/permissions";
import type { Queryable } from "../../share/migrate";

/**
 * The one lock order every transaction about a workspace's people follows
 * (inviting, accepting, removing, changing switches, deleting an account), so
 * none waits on another in a cycle:
 *
 * - L1 the workspace's members lock (`lockMembers`), always first;
 * - L2 the `users` rows involved, `FOR UPDATE`, by ascending id when several;
 * - L3 the workspace's `storage_usage` row (only deleting an account takes it);
 * - L4 the `workspaces` row (`lockOpenWorkspace`), `FOR SHARE`, or `FOR UPDATE`
 *   when deleting an account;
 * - L5 `workspace_invites` rows, `FOR UPDATE`.
 *
 * Taking a lower step after a higher one is a bug.
 */

/** L1: a transaction-scoped advisory lock on the workspace's people. */
export async function lockMembers(tx: Queryable, workspaceId: string): Promise<void> {
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `squint:members:${workspaceId}`,
  ]);
}

/** What the members code reads of a workspace that's open. */
export interface OpenWorkspace {
  name: string;
  seatLimit: number;
  brandColor: string | null;
  fromEmailName: string | null;
}

interface WorkspaceRow {
  name: string;
  seat_limit: number;
  brand_color: string | null;
  from_email_name: string | null;
}

/**
 * L4 for a members operation: the workspace `FOR SHARE`, while it's open (not
 * archived, not waiting to be deleted); null once it isn't. An account
 * deletion locks it `FOR UPDATE` itself (`account-deletion.ts`), so the two
 * wait for each other.
 */
export async function lockOpenWorkspace(
  tx: Queryable,
  workspaceId: string,
): Promise<OpenWorkspace | null> {
  const { rows } = await tx.query<WorkspaceRow>(
    `SELECT name, seat_limit, brand_color, from_email_name FROM workspaces
     WHERE id = $1 AND archived_at IS NULL AND delete_after IS NULL
     FOR SHARE`,
    [workspaceId],
  );
  const row = rows[0];
  return row
    ? {
        name: row.name,
        seatLimit: row.seat_limit,
        brandColor: row.brand_color,
        fromEmailName: row.from_email_name,
      }
    : null;
}

/**
 * The actor's role and switches read again right after L1, since the route's
 * guard read them before any lock: a switch turned off (which takes L1 too)
 * binds an invite or removal still waiting. Null once they're no longer an
 * active member. No row lock: L1 already serialises every change to them.
 */
export async function actorAccess(
  tx: Queryable,
  userId: string,
  workspaceId: string,
): Promise<Access | null> {
  const { rows } = await tx.query<{ role: Membership["role"]; permissions: string[] | null }>(
    `SELECT m.role, m.permissions FROM memberships AS m JOIN users AS u ON u.id = m.user_id
     WHERE m.user_id = $1 AND m.workspace_id = $2 AND u.deleted_at IS NULL`,
    [userId, workspaceId],
  );
  const row = rows[0];
  return row ? { role: row.role, permissions: knownSwitches(row.permissions) } : null;
}
