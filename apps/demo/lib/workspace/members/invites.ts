import { authOrigin } from "../../auth/auth-url";
import { describeError } from "../../auth/http";
import { DEFAULT_SWITCHES, type Access, type MemberSwitch } from "../../auth/permissions";
import { workspaceFromHeader } from "../../email/from-header";
import { emailConfigured, type EmailEnv } from "../../email/resend";
import { brandColor } from "../../share/brand";
import type { Queryable } from "../../share/migrate";
import { openSecret } from "../sealed-secrets";
import { membersOnly } from "../share-invites";
import { toDate } from "../times";
import { INVITE_DAYS, type SendMemberInvites } from "./invite-email";
import type { OpenWorkspace } from "./locks";

/**
 * What making, resending and accepting invites share (044's
 * `workspace_invites`): how long a link works, what its token is sealed to,
 * what it grants, and emailing it once its transaction has committed.
 */

/** How long an invite's link works, from when it's made, renewed or sent again. */
export const INVITE_TTL_MS = INVITE_DAYS * 24 * 60 * 60 * 1000;

export { RESEND_COOLDOWN_MS } from "./invite-timing";

/** What an invite's token is sealed to: its workspace and its own id. */
export const inviteSecretContext = (workspaceId: string, inviteId: string) =>
  `workspace-invite:${workspaceId}:${inviteId}:token`;

/** The invite's token, opened from its sealed copy. Throws when `AUTH_SECRET` changed. */
export function openInviteToken(
  sealed: string,
  workspaceId: string,
  inviteId: string,
  secret: string | undefined,
): string {
  return openSecret(sealed, inviteSecretContext(workspaceId, inviteId), secret);
}

/** Where an invite's token is accepted (the join page, from PR 4). */
export function joinLink(token: string, env: EmailEnv = process.env): string {
  return new URL(`/join/${token}`, authOrigin(env)).toString();
}

/**
 * Whether invite emails go out on this deployment: Resend is set up, and it
 * isn't a preview, which never emails anyone outside the workspace (4.8).
 * Otherwise invites are still made, and their links are copied by hand.
 */
export function inviteEmailEnabled(env: EmailEnv = process.env): boolean {
  return emailConfigured(env) && !membersOnly(env);
}

/**
 * The switches an invite made by `inviter` grants: the defaults, minus any a
 * member inviting lacks, so nobody hands out more than they hold. Never
 * `people`: only the owner gives that, in Members, once someone has joined.
 */
export function inviteGrants(inviter: Access): MemberSwitch[] {
  return DEFAULT_SWITCHES.filter(
    (value) => inviter.role === "owner" || inviter.permissions.includes(value),
  );
}

export interface InviteDeps {
  send: SendMemberInvites;
  env?: EmailEnv;
  secret?: string;
}

/** A workspace that sends invites: its id, and what its emails show. */
export interface InvitingWorkspace extends OpenWorkspace {
  id: string;
}

/** One invite to email: its row, its address and its token. */
export interface OutgoingInvite {
  id: string;
  email: string;
  token: string;
}

/** The name the email gives for whoever made the invite: theirs while their account is open. */
export async function inviterName(db: Queryable, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { rows } = await db.query<{ name: string | null }>(
    "SELECT name FROM users WHERE id = $1 AND deleted_at IS NULL",
    [userId],
  );
  return rows[0]?.name ?? null;
}

/** Records on each row whether its email went out (`last_sent_at`) or not (`last_send_error_at`). */
async function stamp(db: Queryable, ids: readonly string[], emailed: boolean, now: number) {
  const set = emailed
    ? "last_sent_at = $2, send_count = send_count + 1"
    : "last_send_error_at = $2";
  await db.query(`UPDATE workspace_invites SET ${set} WHERE id = ANY($1::uuid[])`, [
    [...ids],
    toDate(now),
  ]);
}

/**
 * Emails `invites` (their transaction has committed) in one Resend batch,
 * from the workspace's sender and in its color, and records on each row
 * whether it went out. Answers whether it did: false with email off, on a
 * preview, or when Resend refused (logged without addresses). A failed email
 * never undoes an invite; its link can be copied instead.
 */
export async function deliverInvites(
  db: Queryable,
  workspace: InvitingWorkspace,
  inviter: string | null,
  invites: readonly OutgoingInvite[],
  now: number,
  { send, env = process.env }: InviteDeps,
): Promise<boolean> {
  if (invites.length === 0) return false;
  const emailed =
    inviteEmailEnabled(env) && (await sendQuietly(workspace, inviter, invites, send, env));
  await stamp(
    db,
    invites.map((invite) => invite.id),
    emailed,
    now,
  );
  return emailed;
}

async function sendQuietly(
  workspace: InvitingWorkspace,
  inviter: string | null,
  invites: readonly OutgoingInvite[],
  send: SendMemberInvites,
  env: EmailEnv,
): Promise<boolean> {
  const from = workspaceFromHeader(
    { fromEmailName: workspace.fromEmailName, workspaceName: workspace.name },
    env.EMAIL_FROM,
  );
  try {
    await send({
      from,
      // No public icon for a workspace yet: the email shows its name, in its color.
      brand: { iconUrl: null, color: brandColor(workspace.brandColor) },
      invites: invites.map(({ email, token }) => ({
        workspace: workspace.name,
        inviter,
        email,
        link: joinLink(token, env),
      })),
    });
    return true;
  } catch (error) {
    console.error(`squint members: invites not sent (${describeError(error)})`);
    return false;
  }
}
