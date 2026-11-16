import { describeError } from "../../auth/http";
import type { SessionUser } from "../../auth/users";
import { database } from "../../db/database";
import { brandColor } from "../../share/brand";
import { readStoredImage } from "../../share/brand-logo";
import type { Queryable } from "../../share/migrate";
import { hashSecret, isSecretShape } from "../../share/tokens";
import type { BlobDriver } from "../blob-driver";
import { toLocation } from "../blobs";
import { toMs } from "../times";
import { inviterName } from "./invites";
import { activeMembers } from "./seats";

/**
 * What an invite's link (`/join/<token>`) shows (4.2, 4b.6), read on the
 * server for whoever opened it. Opening it never accepts it: mail scanners
 * open links too. Only `POST /api/auth/join` does, and it checks everything
 * again under its locks. An unknown token and a closing workspace read the
 * same, naming nothing.
 */

/** The inviting workspace as the page draws it: its name, color and logo. */
export interface JoinBrand {
  workspace: string;
  /** `#rrggbb`, or null for Squint's own accent. */
  color: string | null;
  /** The logo inline as a data URI (the visitor may have no session to fetch it with); null: the monogram. */
  logoSrc: string | null;
  /** The owner's name, for "Ask {Owner}"; null when they have none. */
  owner: string | null;
}

export type JoinPageState =
  /** Unknown token, or its workspace is closing: no brand, nothing named. */
  | { kind: "unknown" }
  /** Reading it failed (no database, or an error, logged by kind only). */
  | { kind: "unavailable" }
  /** Signed in as the invitee, already a member here (a used link opened again): the Overview. */
  | { kind: "member" }
  | { kind: "expired" | "cancelled" | "used" | "full"; brand: JoinBrand }
  /** Signed in as another account, or as the admin. */
  | { kind: "someone-else"; brand: JoinBrand; signedInAs: string; email: string }
  /** Signed in as the invitee, who already belongs to another workspace. */
  | { kind: "in-another"; brand: JoinBrand; other: string }
  /** Signed out; the address's account is being deleted while in another workspace. */
  | { kind: "account-closing"; brand: JoinBrand; email: string }
  /** Signed out; the address has an account that can sign in. */
  | { kind: "sign-in"; brand: JoinBrand; email: string }
  /** Signed out; a new person (or an account this invite brings back): the form. */
  | { kind: "new-person"; brand: JoinBrand; email: string; inviter: string | null }
  /** Signed in as the invitee, in no workspace: one button. */
  | { kind: "join"; brand: JoinBrand; inviter: string | null };

export type JoinPageKind = JoinPageState["kind"];

interface InviteRow {
  workspace_id: string;
  email: string;
  invited_by: string | null;
  accepted: boolean;
  revoked: boolean;
  expires_at: Date;
  workspace: string;
  brand_color: string | null;
  seat_limit: number;
  owner: string | null;
}

interface AccountRow {
  role: "admin" | "company";
  deleted: boolean;
  /** A workspace other than the inviting one that the account belongs to. */
  other: string | null;
  here: boolean;
}

/** The invite behind `token`, with its workspace while it's open; null otherwise. */
async function openInvite(db: Queryable, token: string): Promise<InviteRow | null> {
  const { rows } = await db.query<InviteRow>(
    `SELECT i.workspace_id, i.email, i.invited_by, i.accepted_at IS NOT NULL AS accepted,
       i.revoked_at IS NOT NULL AS revoked, i.expires_at, w.name AS workspace, w.brand_color,
       w.seat_limit,
       (SELECT u.name FROM memberships AS m JOIN users AS u ON u.id = m.user_id
        WHERE m.workspace_id = w.id AND m.role = 'owner') AS owner
     FROM workspace_invites AS i JOIN workspaces AS w ON w.id = i.workspace_id
     WHERE i.token_hash = $1 AND w.archived_at IS NULL AND w.delete_after IS NULL`,
    [hashSecret(token)],
  );
  return rows[0] ?? null;
}

/** The address's account, whatever its state, and where it belongs. */
async function accountOf(
  db: Queryable,
  email: string,
  workspaceId: string,
): Promise<AccountRow | null> {
  const { rows } = await db.query<AccountRow>(
    `SELECT u.role, u.deleted_at IS NOT NULL AS deleted,
       (SELECT w.name FROM memberships AS m JOIN workspaces AS w ON w.id = m.workspace_id
        WHERE m.user_id = u.id AND m.workspace_id <> $2 LIMIT 1) AS other,
       EXISTS (SELECT 1 FROM memberships WHERE user_id = u.id AND workspace_id = $2) AS here
     FROM users AS u WHERE u.email = $1`,
    [email, workspaceId],
  );
  return rows[0] ?? null;
}

/** The workspace's logo as a data URI, or null without one (or when its file won't read). */
async function logoUri(
  db: Queryable,
  workspaceId: string,
  driver?: Pick<BlobDriver, "read">,
): Promise<string | null> {
  const { rows } = await db.query<{
    key: string;
    bytes: Uint8Array | null;
    blob_url: string | null;
  }>(
    `SELECT logo.key, logo.bytes, logo.blob_url FROM workspaces AS workspace
     JOIN workspace_blobs AS logo
       ON logo.workspace_id = workspace.id AND logo.key = workspace.logo_blob_key
       AND logo.project_id IS NULL
       AND starts_with(logo.key, 'ws/' || workspace.id::text || '/brand/logo/')
     WHERE workspace.id = $1`,
    [workspaceId],
  );
  const row = rows[0];
  if (!row) return null;
  const logo = await readStoredImage({ key: row.key, location: toLocation(row) }, driver);
  return logo && `data:${logo.contentType};base64,${Buffer.from(logo.bytes).toString("base64")}`;
}

/** Why the invite itself can't be used now, whoever opened it; null while it can. */
function inviteState(invite: InviteRow, now: number): "used" | "cancelled" | "expired" | null {
  if (invite.accepted) return "used";
  if (invite.revoked) return "cancelled";
  return toMs(invite.expires_at) <= now ? "expired" : null;
}

export interface JoinPageDeps {
  /** Reads the logo's file; the deployment's blob driver by default. */
  driver?: Pick<BlobDriver, "read">;
}

/**
 * The state of `/join/<token>` for `session` (null: signed out) at `now`. In
 * order: the link (unknown, or its workspace closing); an invitee already in
 * (to the Overview); the invite (used, cancelled, expired); another account
 * signed in; the invitee's account (in another workspace, or being deleted
 * while in one); a seat; then what joining takes (sign in, the form, or one
 * button). The same rules as `acceptInvite`, so what the page offers is what
 * the POST would do.
 */
export async function loadJoinPage(
  db: Queryable,
  token: string,
  session: SessionUser | null,
  now: number,
  { driver }: JoinPageDeps = {},
): Promise<JoinPageState> {
  if (!isSecretShape(token)) return { kind: "unknown" };
  const invite = await openInvite(db, token);
  if (!invite) return { kind: "unknown" };
  const account = await accountOf(db, invite.email, invite.workspace_id);
  const invitee = session !== null && session.role !== "admin" && session.email === invite.email;
  if (invitee && account?.here) return { kind: "member" };
  const brand: JoinBrand = {
    workspace: invite.workspace,
    color: brandColor(invite.brand_color),
    logoSrc: await logoUri(db, invite.workspace_id, driver),
    owner: invite.owner,
  };
  const closed = inviteState(invite, now);
  if (closed) return { kind: closed, brand };
  if (session && !invitee) {
    return { kind: "someone-else", brand, signedInAs: session.email, email: invite.email };
  }
  if (invitee && account?.other) return { kind: "in-another", brand, other: account.other };
  if (!session && account?.deleted && account.role !== "admin" && account.other) {
    return { kind: "account-closing", brand, email: invite.email };
  }
  if ((await activeMembers(db, invite.workspace_id)) >= invite.seat_limit) {
    return { kind: "full", brand };
  }
  const inviter = await inviterName(db, invite.invited_by);
  if (invitee) return { kind: "join", brand, inviter };
  if (account && (!account.deleted || account.role === "admin")) {
    return { kind: "sign-in", brand, email: invite.email };
  }
  return { kind: "new-person", brand, email: invite.email, inviter };
}

/**
 * `loadJoinPage` for this request's page: `unavailable` without a database,
 * or when reading fails (logged by kind only, never the token).
 */
export async function readJoinPage(
  token: string,
  session: SessionUser | null,
): Promise<JoinPageState> {
  const pending = database();
  if (!pending) return { kind: "unavailable" };
  try {
    return await loadJoinPage(await pending, token, session, Date.now());
  } catch (error) {
    console.error(`squint join: page read failed (${describeError(error)})`);
    return { kind: "unavailable" };
  }
}
