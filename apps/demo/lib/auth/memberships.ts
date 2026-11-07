import type { Queryable } from "../share/migrate";

export type MembershipRole = "owner" | "member";

export interface Membership {
  workspaceId: string;
  slug: string;
  name: string;
  role: MembershipRole;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The user's membership of a workspace that isn't archived, or null: also for
 * ids that aren't UUIDs, so a made-up id never reaches Postgres. Admins get no
 * pass here; only /admin bypasses membership (`requireAdmin`).
 */
export async function findMembership(
  db: Queryable,
  userId: string,
  workspaceId: string,
): Promise<Membership | null> {
  if (!UUID.test(workspaceId)) return null;
  const { rows } = await db.query<Membership>(
    `SELECT w.id AS "workspaceId", w.slug, w.name, m.role
     FROM memberships AS m JOIN workspaces AS w ON w.id = m.workspace_id
     WHERE m.user_id = $1 AND m.workspace_id = $2 AND w.archived_at IS NULL`,
    [userId, workspaceId],
  );
  return rows[0] ?? null;
}

/**
 * The workspace the user works in: their oldest membership of a workspace
 * that isn't archived (Phase 1 has one per company user), or null, as for the
 * admin, who belongs to none. Check it with `requireMember` before use.
 */
export async function findOwnWorkspace(db: Queryable, userId: string): Promise<Membership | null> {
  const { rows } = await db.query<Membership>(
    `SELECT w.id AS "workspaceId", w.slug, w.name, m.role
     FROM memberships AS m JOIN workspaces AS w ON w.id = m.workspace_id
     WHERE m.user_id = $1 AND w.archived_at IS NULL
     ORDER BY m.created_at, w.id LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}
