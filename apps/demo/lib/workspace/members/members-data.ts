import { describeError } from "../../auth/http";
import type { Membership, MembershipRole } from "../../auth/memberships";
import { can, knownSwitches, MEMBER_SWITCHES, type MemberSwitch } from "../../auth/permissions";
import type { EmailEnv } from "../../email/resend";
import type { Queryable } from "../../share/migrate";
import { toMs } from "../times";
import { inviteEmailEnabled, joinLink, openInviteToken } from "./invites";
import { seatsUsed, type Seats } from "./seats";

/**
 * What the Members settings page shows (4b.2, 4b.3, 4b.14), read on the
 * server for the session's user. Everyone sees who's in the workspace: names,
 * roles and when they joined. The owner, and a member with the people switch
 * (D4), also see emails, open invites with their links, the seats, whether
 * email is on, and members who deleted their own account and are leaving.
 * Only the owner sees anyone's switches; a member sees their own (D5).
 */

/** A member as everyone sees them. */
export interface MemberEntry {
  name: string | null;
  role: MembershipRole;
  /** When they joined (epoch ms). */
  joinedAt: number;
  /** The session's own row. */
  you: boolean;
}

/** A member as the owner and a member with the people switch see them. */
export interface ManagedMember extends MemberEntry {
  id: string;
  email: string;
  /** Their switches, in the owner's view only. */
  permissions?: MemberSwitch[];
}

/** A member who deleted their own account and is in their 30 days: no seat, no Remove (I7). */
export interface LeavingMember {
  id: string;
  name: string | null;
  email: string;
  /** When their account is deleted for good (epoch ms). */
  until: number;
}

export interface PendingInvite {
  id: string;
  email: string;
  /** Who made it: their name, else their email; null once their account is gone. */
  invitedBy: string | null;
  createdAt: number;
  expiresAt: number;
  /** Past `expiresAt`: it holds no seat, and has no link until it's renewed. */
  expired: boolean;
  /** The join link, for Copy link without a fetch; null once expired. */
  link: string | null;
  /** Its last email didn't go out (email off, or Resend refused it), or none has yet. */
  emailNotSent: boolean;
}

interface Common {
  workspaceName: string;
  /** The owner's name, for "Ask {Owner}"; null when they have none. */
  ownerName: string | null;
}

export type MembersData =
  | (Common & {
      view: "owner" | "manager";
      members: ManagedMember[];
      seats: Seats;
      /** Whether invites are emailed here; false: their links are copied by hand. */
      emailEnabled: boolean;
      invites: PendingInvite[];
      leaving: LeavingMember[];
      /** The session member's own switches; the owner has every one. */
      ownPermissions: MemberSwitch[];
    })
  | (Common & { view: "member"; members: MemberEntry[]; ownPermissions: MemberSwitch[] });

interface MemberRow {
  id: string;
  name: string | null;
  email: string;
  role: MembershipRole;
  permissions: string[] | null;
  created_at: Date;
  deleted: boolean;
  delete_after: Date | null;
}

interface InviteRow {
  id: string;
  email: string;
  token_sealed: string;
  invited_by: string | null;
  created_at: Date;
  expires_at: Date;
  email_not_sent: boolean;
}

/** Everyone with a membership of the workspace: the owner first, then by name and email. */
async function memberRows(db: Queryable, workspaceId: string): Promise<MemberRow[]> {
  const { rows } = await db.query<MemberRow>(
    `SELECT u.id, u.name, u.email, m.role, m.permissions, m.created_at,
       u.deleted_at IS NOT NULL AS deleted, u.delete_after
     FROM memberships AS m JOIN users AS u ON u.id = m.user_id
     WHERE m.workspace_id = $1
     ORDER BY m.role = 'owner' DESC, lower(u.name) NULLS LAST, u.email`,
    [workspaceId],
  );
  return rows;
}

/** Open invites (expired ones included), oldest first, with who made them. */
async function inviteRows(db: Queryable, workspaceId: string): Promise<InviteRow[]> {
  const { rows } = await db.query<InviteRow>(
    `SELECT i.id, i.email, i.token_sealed, COALESCE(u.name, u.email) AS invited_by,
       i.created_at, i.expires_at,
       (i.last_sent_at IS NULL OR i.last_send_error_at > i.last_sent_at) AS email_not_sent
     FROM workspace_invites AS i
     LEFT JOIN users AS u ON u.id = i.invited_by AND u.deleted_at IS NULL
     WHERE i.workspace_id = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL
     ORDER BY i.created_at, i.id`,
    [workspaceId],
  );
  return rows;
}

/** The invite's link, or null when its sealed token no longer opens (`AUTH_SECRET` changed). */
function linkOf(row: InviteRow, workspaceId: string, env: EmailEnv): string | null {
  try {
    return joinLink(openInviteToken(row.token_sealed, workspaceId, row.id, env.AUTH_SECRET), env);
  } catch (error) {
    console.error(`squint members: invite link unreadable (${describeError(error)})`);
    return null;
  }
}

function toInvite(row: InviteRow, workspaceId: string, now: number, env: EmailEnv) {
  const expired = toMs(row.expires_at) <= now;
  return {
    id: row.id,
    email: row.email,
    invitedBy: row.invited_by,
    createdAt: toMs(row.created_at),
    expiresAt: toMs(row.expires_at),
    expired,
    link: expired ? null : linkOf(row, workspaceId, env),
    emailNotSent: row.email_not_sent,
  } satisfies PendingInvite;
}

function toEntry(row: MemberRow, userId: string): MemberEntry {
  return { name: row.name, role: row.role, joinedAt: toMs(row.created_at), you: row.id === userId };
}

/**
 * The Members page's data for `userId`, whose membership of the workspace is
 * `membership` (already checked). Emails, invites and leaving members only
 * when they may manage people (`members.manage`); switches only for the owner.
 */
export async function loadMembersData(
  db: Queryable,
  userId: string,
  membership: Membership,
  now: number,
  env: EmailEnv = process.env,
): Promise<MembersData> {
  const { workspaceId } = membership;
  const rows = await memberRows(db, workspaceId);
  const active = rows.filter((row) => !row.deleted);
  const common: Common = {
    workspaceName: membership.name,
    ownerName: rows.find((row) => row.role === "owner")?.name ?? null,
  };
  const isOwner = membership.role === "owner";
  const ownPermissions = isOwner ? [...MEMBER_SWITCHES] : membership.permissions;
  if (!can(membership, "members.manage")) {
    const members = active.map((row) => toEntry(row, userId));
    return { ...common, view: "member", members, ownPermissions };
  }
  const { rows: limit } = await db.query<{ seat_limit: number }>(
    "SELECT seat_limit FROM workspaces WHERE id = $1",
    [workspaceId],
  );
  return {
    ...common,
    view: isOwner ? "owner" : "manager",
    members: active.map((row) => ({
      ...toEntry(row, userId),
      id: row.id,
      email: row.email,
      ...(isOwner && row.role === "member" ? { permissions: knownSwitches(row.permissions) } : {}),
    })),
    seats: { used: await seatsUsed(db, workspaceId, now), limit: limit[0]?.seat_limit ?? 0 },
    emailEnabled: inviteEmailEnabled(env),
    invites: (await inviteRows(db, workspaceId)).map((row) => toInvite(row, workspaceId, now, env)),
    leaving: rows
      .filter((row) => row.deleted)
      .map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        until: row.delete_after ? toMs(row.delete_after) : now,
      })),
    ownPermissions,
  };
}
