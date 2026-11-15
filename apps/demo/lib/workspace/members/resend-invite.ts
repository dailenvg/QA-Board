import { audit } from "../../account/audit";
import { can } from "../../auth/permissions";
import type { Database } from "../../db/database";
import type { Queryable } from "../../share/migrate";
import { toDate, toMs } from "../times";
import { claimInviteEmails, type InviteEmailClaim } from "./invite-sends";
import {
  deliverInvites,
  INVITE_TTL_MS,
  inviteEmailEnabled,
  inviterName,
  openInviteToken,
  RESEND_COOLDOWN_MS,
  type InviteDeps,
  type InvitingWorkspace,
  type OutgoingInvite,
} from "./invites";
import { actorAccess, lockMembers, lockOpenWorkspace } from "./locks";
import { seatsLeft, seatsUsed, type Seats } from "./seats";

/**
 * Resending an open invite (4.3, decision 19): the same link, working for 7
 * days from now, emailed again when email is on. An expired one takes a seat
 * again ("Resend and renew"). Anyone who may manage invites resends any of
 * them, whoever made it (D2).
 */

export type ResendOutcome =
  | { ok: true; emailed: boolean; expiresAt: number }
  /** The actor may no longer manage invites, or the invite is gone, used or cancelled. */
  | { ok: false; reason: "not-allowed" | "not-found" }
  /** Its last email went out less than a minute ago. */
  | { ok: false; reason: "cooldown"; retryAfterSeconds: number }
  | { ok: false; reason: "seats-full"; seats: Seats }
  | ({ ok: false; reason: "rate-limited" } & Omit<Extract<InviteEmailClaim, { ok: false }>, "ok">);

interface InviteRow {
  email: string;
  token_sealed: string;
  invited_by: string | null;
  expires_at: Date;
  last_sent_at: Date | null;
}

interface Actor {
  userId: string;
  workspaceId: string;
}

type Planned =
  | Exclude<ResendOutcome, { ok: true }>
  | {
      ok: true;
      invite: OutgoingInvite;
      workspace: InvitingWorkspace;
      inviter: string | null;
      expiresAt: number;
    };

/** L1, the actor again, L4, then the invite (L5), its checks, and the renewal. */
async function renew(
  tx: Queryable,
  actor: Actor,
  inviteId: string,
  now: number,
  { emailOn, secret }: { emailOn: boolean; secret: string | undefined },
): Promise<Planned> {
  await lockMembers(tx, actor.workspaceId);
  const access = await actorAccess(tx, actor.userId, actor.workspaceId);
  if (!access || !can(access, "members.manage")) return { ok: false, reason: "not-allowed" };
  const open = await lockOpenWorkspace(tx, actor.workspaceId);
  if (!open) return { ok: false, reason: "not-found" };
  const { rows } = await tx.query<InviteRow>(
    `SELECT email, token_sealed, invited_by, expires_at, last_sent_at FROM workspace_invites
     WHERE id = $1 AND workspace_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL
     FOR UPDATE`,
    [inviteId, actor.workspaceId],
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: "not-found" };
  const sentAgo = row.last_sent_at ? now - toMs(row.last_sent_at) : Infinity;
  if (emailOn && sentAgo < RESEND_COOLDOWN_MS) {
    const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - sentAgo) / 1000);
    return { ok: false, reason: "cooldown", retryAfterSeconds };
  }
  if (toMs(row.expires_at) <= now) {
    const seats = { used: await seatsUsed(tx, actor.workspaceId, now), limit: open.seatLimit };
    if (seatsLeft(seats) < 1) return { ok: false, reason: "seats-full", seats };
  }
  if (emailOn) {
    const claim = await claimInviteEmails(tx, actor.workspaceId, 1, now);
    if (!claim.ok) {
      const { retryAfterSeconds, sentInWindow, limit } = claim;
      return { ok: false, reason: "rate-limited", retryAfterSeconds, sentInWindow, limit };
    }
  }
  const expiresAt = now + INVITE_TTL_MS;
  await tx.query("UPDATE workspace_invites SET expires_at = $2 WHERE id = $1", [
    inviteId,
    toDate(expiresAt),
  ]);
  await audit(
    tx,
    {
      actorUserId: actor.userId,
      workspaceId: actor.workspaceId,
      action: "member.invite_resent",
      target: { type: "invite", id: inviteId },
      fields: ["expires_at"],
    },
    now,
  );
  const token = openInviteToken(row.token_sealed, actor.workspaceId, inviteId, secret);
  return {
    ok: true,
    invite: { id: inviteId, email: row.email, token },
    workspace: { id: actor.workspaceId, ...open },
    inviter: await inviterName(tx, row.invited_by),
    expiresAt,
  };
}

/**
 * Resends invite `inviteId` of the actor's workspace: renews it, then emails
 * it again (when email is on) as whoever made it. Answers whether the email
 * went out and when the link now stops working. Refused, changing nothing,
 * within a minute of its last email, without a seat for an expired one, or
 * over the day's email limit.
 */
export async function resendInvite(
  db: Database,
  actor: Actor,
  inviteId: string,
  now: number,
  deps: InviteDeps,
): Promise<ResendOutcome> {
  const { env = process.env, secret = env.AUTH_SECRET } = deps;
  const emailOn = inviteEmailEnabled(env);
  const planned = await db.transaction((tx) =>
    renew(tx, actor, inviteId, now, { emailOn, secret }),
  );
  if (!planned.ok) return planned;
  const { workspace, inviter, invite, expiresAt } = planned;
  const emailed = await deliverInvites(db, workspace, inviter, [invite], now, deps);
  return { ok: true, emailed, expiresAt };
}
