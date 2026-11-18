import type { Queryable } from "../share/migrate";
import { knownSwitches, type MemberSwitch } from "./permissions";

export type MembershipRole = "owner" | "member";

export interface Membership {
  workspaceId: string;
  slug: string;
  name: string;
  role: MembershipRole;
  /**
   * The owner's switches for this member (041), read with the membership on
   * every request, so a change binds the member's next one. The owner's row
   * has them too, but `can` never reads an owner's.
   */
  permissions: MemberSwitch[];
}

type MembershipRow = Omit<Membership, "permissions"> & { permissions: string[] | null };

const COLUMNS = `w.id AS "workspaceId", w.slug, w.name, m.role, m.permissions`;

function toMembership({ permissions, ...row }: MembershipRow): Membership {
  return { ...row, permissions: knownSwitches(permissions) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A workspace anyone can work in, as a condition on its row, named `alias` in
 * the query: not archived, not waiting to be deleted (033), and not suspended
 * by the Squint admin (046). Every check of whether a workspace is open uses
 * this, so a closed one is closed everywhere at once.
 */
export function openWorkspace(alias: string): string {
  return `${alias}.archived_at IS NULL AND ${alias}.delete_after IS NULL AND ${alias}.suspended_at IS NULL`;
}

const OPEN_WORKSPACE = openWorkspace("w");

/**
 * The user's membership of a workspace that's open (`OPEN_WORKSPACE`), or null: also for
 * ids that aren't UUIDs, so a made-up id never reaches Postgres. Admins get no
 * pass here; only /admin bypasses membership (`requireAdmin`).
 */
export async function findMembership(
  db: Queryable,
  userId: string,
  workspaceId: string,
): Promise<Membership | null> {
  if (!UUID.test(workspaceId)) return null;
  const { rows } = await db.query<MembershipRow>(
    `SELECT ${COLUMNS}
     FROM memberships AS m JOIN workspaces AS w ON w.id = m.workspace_id
     WHERE m.user_id = $1 AND m.workspace_id = $2 AND ${OPEN_WORKSPACE}`,
    [userId, workspaceId],
  );
  return rows[0] ? toMembership(rows[0]) : null;
}

/**
 * The workspace the user works in: their oldest membership of an open
 * workspace, or null, as for the admin, who belongs to none. One workspace
 * per person is an invariant, not a schema rule: inviting and accepting
 * refuse an address that has a membership anywhere (a unique index would
 * break restoring an account). Check it with `requireMember` before use.
 */
export async function findOwnWorkspace(db: Queryable, userId: string): Promise<Membership | null> {
  const { rows } = await db.query<MembershipRow>(
    `SELECT ${COLUMNS}
     FROM memberships AS m JOIN workspaces AS w ON w.id = m.workspace_id
     WHERE m.user_id = $1 AND ${OPEN_WORKSPACE}
     ORDER BY m.created_at, w.id LIMIT 1`,
    [userId],
  );
  return rows[0] ? toMembership(rows[0]) : null;
}
