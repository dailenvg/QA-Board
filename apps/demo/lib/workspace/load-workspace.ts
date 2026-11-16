import { WITH_LOGO } from "../account/workspace-logo";
import type { Membership } from "../auth/memberships";
import { personAvatarSrc } from "../routes";
import { brandColor, iconVersionOf, logoVersion } from "../share/brand";
import type { Queryable } from "../share/migrate";
import { clientActivity } from "./activity";
import { storageSummary } from "./blobs";
import { listComments } from "./comments";
import { listFolders } from "./folders";
import { listProjects } from "./projects";
import { listSnapshots } from "./snapshots";
import { personKey } from "./members/person-key";
import type { WorkspaceData } from "./types";

/** The member's name for new comments, or null until they give one. */
export async function authorName(db: Queryable, userId: string): Promise<string | null> {
  const { rows } = await db.query<{ name: string | null }>("SELECT name FROM users WHERE id = $1", [
    userId,
  ]);
  return rows[0]?.name ?? null;
}

/**
 * The member's name for new comments, and their own photo's URL in the
 * workspace (as `listComments` gives it on their comments), in one read.
 */
async function authorOf(db: Queryable, userId: string, workspaceId: string) {
  const { rows } = await db.query<{ name: string | null; avatar_key: string | null }>(
    `SELECT account.name, avatar.key AS avatar_key FROM users AS account
     LEFT JOIN user_blobs AS avatar
       ON avatar.user_id = account.id AND avatar.key = account.avatar_blob_key
       AND starts_with(avatar.key, 'user/' || account.id::text || '/avatar/')
     WHERE account.id = $1`,
    [userId],
  );
  const avatarKey = rows[0]?.avatar_key ?? null;
  return {
    name: rows[0]?.name ?? null,
    avatarSrc:
      avatarKey &&
      personAvatarSrc(workspaceId, personKey(workspaceId, userId), logoVersion(avatarKey)),
  };
}

export async function setAuthorName(db: Queryable, userId: string, name: string): Promise<void> {
  await db.query("UPDATE users SET name = $2 WHERE id = $1", [userId, name]);
}

interface BrandRow {
  name: string;
  from_email_name: string | null;
  brand_color: string | null;
  logo_key: string | null;
}

/**
 * Who the workspace's emails come from, and its color: for the Share window's
 * preview. With its icon's version, from the same read as the icon's route.
 */
async function brandOf(db: Queryable, workspaceId: string) {
  const { rows } = await db.query<BrandRow>(
    `SELECT workspace.name, workspace.from_email_name, workspace.brand_color,
       logo.key AS logo_key
     FROM ${WITH_LOGO} WHERE workspace.id = $1`,
    [workspaceId],
  );
  const row = rows[0];
  return {
    fromEmailName: row?.from_email_name ?? null,
    brandColor: row?.brand_color ?? null,
    iconVersion: iconVersionOf({
      name: row?.name ?? "",
      color: brandColor(row?.brand_color),
      logoKey: row?.logo_key ?? null,
    }),
  };
}

/** The workspace owner's name, for "Ask {Owner}"; null until they give one. */
async function ownerNameOf(db: Queryable, workspaceId: string): Promise<string | null> {
  const { rows } = await db.query<{ name: string | null }>(
    `SELECT owner.name FROM memberships AS membership
     JOIN users AS owner ON owner.id = membership.user_id
     WHERE membership.workspace_id = $1 AND membership.role = 'owner'`,
    [workspaceId],
  );
  return rows[0]?.name ?? null;
}

/**
 * Everything a signed-in browser shows for the workspace, in one read: its
 * folders, live projects (archived included, trash not), and their pages,
 * snapshots and comments, and what clients have said on them (pulled or
 * still on their review links), and what the member may do there (their
 * role and switches, as of this read). Review link secrets aren't in it.
 */
export async function loadWorkspace(
  db: Queryable,
  membership: Membership,
  userId: string,
): Promise<WorkspaceData> {
  const { workspaceId } = membership;
  const [folders, projects, snapshots, comments, clients, storage, author, brand, ownerName] =
    await Promise.all([
      listFolders(db, workspaceId),
      listProjects(db, workspaceId),
      listSnapshots(db, workspaceId),
      listComments(db, workspaceId, undefined, userId),
      clientActivity(db, workspaceId),
      storageSummary(db, workspaceId),
      authorOf(db, userId, workspaceId),
      brandOf(db, workspaceId),
      ownerNameOf(db, workspaceId),
    ]);
  return {
    workspace: {
      id: workspaceId,
      slug: membership.slug,
      name: membership.name,
      ...brand,
      role: membership.role,
      permissions: membership.permissions,
      ownerName,
      avatarSrc: author.avatarSrc,
    },
    folders,
    projects,
    snapshots,
    comments,
    clientActivity: clients,
    storage,
    authorName: author.name,
  };
}
