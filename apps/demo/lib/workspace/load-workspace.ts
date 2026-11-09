import type { Membership } from "../auth/memberships";
import type { Queryable } from "../share/migrate";
import { clientActivity } from "./activity";
import { storageSummary } from "./blobs";
import { listComments } from "./comments";
import { listFolders } from "./folders";
import { listProjects } from "./projects";
import { listSnapshots } from "./snapshots";
import type { WorkspaceData } from "./types";

/** The member's name for new comments, or null until they give one. */
export async function authorName(db: Queryable, userId: string): Promise<string | null> {
  const { rows } = await db.query<{ name: string | null }>("SELECT name FROM users WHERE id = $1", [
    userId,
  ]);
  return rows[0]?.name ?? null;
}

export async function setAuthorName(db: Queryable, userId: string, name: string): Promise<void> {
  await db.query("UPDATE users SET name = $2 WHERE id = $1", [userId, name]);
}

/**
 * Everything a signed-in browser shows for the workspace, in one read: its
 * folders, live projects (archived included, trash not), and their pages,
 * snapshots and comments, and what clients have said on them (pulled or
 * still on their review links). Review link secrets aren't in it.
 */
export async function loadWorkspace(
  db: Queryable,
  membership: Membership,
  userId: string,
): Promise<WorkspaceData> {
  const { workspaceId } = membership;
  const [folders, projects, snapshots, comments, clients, storage, author] = await Promise.all([
    listFolders(db, workspaceId),
    listProjects(db, workspaceId),
    listSnapshots(db, workspaceId),
    listComments(db, workspaceId),
    clientActivity(db, workspaceId),
    storageSummary(db, workspaceId),
    authorName(db, userId),
  ]);
  return {
    workspace: { id: workspaceId, slug: membership.slug, name: membership.name },
    folders,
    projects,
    snapshots,
    comments,
    clientActivity: clients,
    storage,
    authorName: author,
  };
}
