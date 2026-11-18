import type { Queryable } from "../share/migrate";
import { toMs, toMsOrNull } from "../workspace/times";

/**
 * The admin panel's Workspaces page: every workspace with its owner, size and
 * state, the archived ones apart. Read-only; the actions are in
 * `workspace-actions.ts`.
 */

/**
 * Where a workspace stands, archived or not: due for deletion (its owner
 * deleted their account, 033) comes first, then suspended by the admin (046).
 */
export type WorkspaceStatus = "active" | "suspended" | "deleting";

export interface AdminWorkspace {
  id: string;
  name: string;
  slug: string;
  /** The owner's sign-in email; null when the workspace has no owner row. */
  ownerEmail: string | null;
  /**
   * The owner's account can sign in (it isn't deleted, or scheduled to be):
   * only then can the admin make them a reset link.
   */
  ownerActive: boolean;
  /** People in it whose accounts aren't deleted, the owner included. */
  members: number;
  /** Projects not in the trash, archived ones included. */
  projects: number;
  usedBytes: number;
  quotaBytes: number;
  /**
   * The latest of: a project changed, a comment added or changed (the team's,
   * or a client's once it reached the workspace), or an audit entry by one of
   * its people. Not the admin's own actions, nor Squint's cron. Null when none.
   */
  lastActivityAt: number | null;
  status: WorkspaceStatus;
  /** When it was archived; null while it's not. */
  archivedAt: number | null;
  suspendedAt: number | null;
  /** When it's due to be deleted; null unless `status` is `deleting`. */
  deleteAfter: number | null;
  createdAt: number;
}

export interface AdminWorkspaces {
  /** Not archived, by name. */
  active: AdminWorkspace[];
  /** Archived, most recently archived first. */
  archived: AdminWorkspace[];
}

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  owner_email: string | null;
  owner_active: boolean;
  members: number;
  projects: number;
  used_bytes: string | number;
  quota_bytes: string | number;
  last_activity_at: Date | null;
  archived_at: Date | null;
  suspended_at: Date | null;
  delete_after: Date | null;
  created_at: Date;
}

/** `lastActivityAt`'s sources, newest of the three (GREATEST skips the empty ones). */
const LAST_ACTIVITY = `GREATEST(
  (SELECT max(project.updated_at) FROM projects AS project WHERE project.workspace_id = w.id),
  (SELECT max(comment.updated_at) FROM comments AS comment
     JOIN projects AS project ON project.id = comment.project_id
     WHERE project.workspace_id = w.id),
  (SELECT max(entry.at) FROM audit_log AS entry
     JOIN users AS actor ON actor.id = entry.actor_user_id
     WHERE entry.workspace_id = w.id AND actor.role = 'company')
)`;

function statusOf(row: Pick<WorkspaceRow, "delete_after" | "suspended_at">): WorkspaceStatus {
  if (row.delete_after) return "deleting";
  return row.suspended_at ? "suspended" : "active";
}

function toWorkspace(row: WorkspaceRow): AdminWorkspace {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    ownerEmail: row.owner_email,
    ownerActive: row.owner_active,
    members: row.members,
    projects: row.projects,
    usedBytes: Number(row.used_bytes),
    quotaBytes: Number(row.quota_bytes),
    lastActivityAt: toMsOrNull(row.last_activity_at),
    status: statusOf(row),
    archivedAt: toMsOrNull(row.archived_at),
    suspendedAt: toMsOrNull(row.suspended_at),
    deleteAfter: toMsOrNull(row.delete_after),
    createdAt: toMs(row.created_at),
  };
}

const SELECT_WORKSPACES = `SELECT w.id, w.name, w.slug, owner.email AS owner_email,
    (owner.id IS NOT NULL AND owner.deleted_at IS NULL) AS owner_active,
    (SELECT count(*) FROM memberships AS m JOIN users AS u ON u.id = m.user_id
       WHERE m.workspace_id = w.id AND u.deleted_at IS NULL)::int AS members,
    (SELECT count(*) FROM projects AS project
       WHERE project.workspace_id = w.id AND project.deleted_at IS NULL)::int AS projects,
    coalesce(usage.bytes, 0) AS used_bytes, w.storage_quota_bytes AS quota_bytes,
    ${LAST_ACTIVITY} AS last_activity_at,
    w.archived_at, w.suspended_at, w.delete_after, w.created_at
  FROM workspaces AS w
  LEFT JOIN memberships AS ownership ON ownership.workspace_id = w.id AND ownership.role = 'owner'
  LEFT JOIN users AS owner ON owner.id = ownership.user_id
  LEFT JOIN storage_usage AS usage ON usage.workspace_id = w.id`;

/** Every workspace, the archived ones apart. */
export async function loadAdminWorkspaces(db: Queryable): Promise<AdminWorkspaces> {
  const { rows } = await db.query<WorkspaceRow>(
    `${SELECT_WORKSPACES} ORDER BY lower(w.name), w.id`,
  );
  const workspaces = rows.map(toWorkspace);
  return {
    active: workspaces.filter((workspace) => workspace.archivedAt === null),
    archived: workspaces
      .filter((workspace) => workspace.archivedAt !== null)
      .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0)),
  };
}

/** One workspace as the list shows it, or null when there's none with this id. */
export async function loadAdminWorkspace(
  db: Queryable,
  workspaceId: string,
): Promise<AdminWorkspace | null> {
  const { rows } = await db.query<WorkspaceRow>(`${SELECT_WORKSPACES} WHERE w.id = $1`, [
    workspaceId,
  ]);
  return rows[0] ? toWorkspace(rows[0]) : null;
}
