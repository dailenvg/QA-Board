import { createHmac } from "node:crypto";
import { audit } from "../account/audit";
import { authOrigin } from "../auth/auth-url";
import { describeError } from "../auth/http";
import type { Database } from "../db/database";
import { workspaceFromHeader } from "../email/from-header";
import { emailConfigured, type EmailEnv } from "../email/resend";
import { brandColor, brandIconPath, toClientBrand } from "../share/brand";
import type { InviteDetails } from "../share/invite-copy";
import type { InviteBrand, SendInvites } from "../share/invite-email";
import { claimInviteSends } from "../share/invite-limits";
import type { Queryable } from "../share/migrate";
import { reviewClosed, reviewDeadline } from "../share/review-window";
import { serverKey } from "../share/server-key";
import { openSecret } from "./sealed-secrets";
import { linkSecretContext } from "./share-links";

/**
 * Emailing a review link's invitation from the Share window. No invitee list
 * is kept: the audit log records each send with keyed HMACs of its addresses,
 * and the link's `invited_count` (038) is recounted from there, so the window
 * can say "Sent to N people" without Squint holding an address.
 */

const INVITEE_INFO = "squint/share-invitee/v1";

/** How an invitee is recorded: an HMAC keyed from `AUTH_SECRET`; throws without it (fails closed). */
export function inviteeKey(address: string, secret: string | undefined = process.env.AUTH_SECRET) {
  return createHmac("sha256", serverKey(INVITEE_INFO, secret))
    .update(address, "utf8")
    .digest("hex");
}

/**
 * A deployment (Vercel) that can't email: invites answer `email-off` there
 * rather than say they went. Local development and tests skip the email and
 * go on, as every Squint email does without Resend settings.
 */
export function emailOff(env: EmailEnv = process.env): boolean {
  return Boolean(env.VERCEL) && !emailConfigured(env);
}

/** On a Vercel preview, invitations only go to the workspace's own members. */
export function membersOnly(env: EmailEnv = process.env): boolean {
  return env.VERCEL_ENV === "preview" || env.NEXT_PUBLIC_VERCEL_ENV === "preview";
}

interface TargetRow {
  share_id: string;
  token_sealed: string;
  created_at: string | number;
  review_window_hours: number | null;
  password_set_at: Date | null;
  client_name: string | null;
  project_name: string;
  archived_at: Date | null;
  company: string;
  from_email_name: string | null;
  brand_color: string | null;
  logo_key: string | null;
}

/** A live project's link, as an invitation needs it; null without one. */
async function inviteTarget(db: Queryable, workspaceId: string, projectId: string) {
  const { rows } = await db.query<TargetRow>(
    `SELECT link.share_id, link.token_sealed, share.created_at, share.review_window_hours,
       share.password_set_at, share.client_name, share.project->>'name' AS project_name,
       project.archived_at, workspace.name AS company, workspace.from_email_name,
       workspace.brand_color, logo.key AS logo_key
     FROM project_share_links AS link
     JOIN projects AS project
       ON project.workspace_id = link.workspace_id AND project.id = link.project_id
     JOIN squint_shares AS share ON share.id = link.share_id
     JOIN workspaces AS workspace ON workspace.id = link.workspace_id
     LEFT JOIN workspace_blobs AS logo
       ON logo.workspace_id = workspace.id AND logo.key = workspace.logo_blob_key
       AND logo.project_id IS NULL
     WHERE link.workspace_id = $1 AND link.project_id = $2 AND project.deleted_at IS NULL`,
    [workspaceId, projectId],
  );
  return rows[0] ?? null;
}

/** Which of `addresses` (normalized) aren't the sign-in email of a member of the workspace. */
async function nonMembers(
  db: Queryable,
  workspaceId: string,
  addresses: readonly string[],
): Promise<string[]> {
  const { rows } = await db.query<{ email: string }>(
    `SELECT lower(users.email) AS email FROM memberships
     JOIN users ON users.id = memberships.user_id
     WHERE memberships.workspace_id = $1 AND lower(users.email) = ANY($2::text[])`,
    [workspaceId, [...addresses]],
  );
  const members = new Set(rows.map((row) => row.email));
  return addresses.filter((address) => !members.has(address));
}

/**
 * Records a send (the audit entry, addresses as HMACs only) and recounts how
 * many different people the link's invitations have reached. Answers the count.
 */
async function recordInvites(
  db: Database,
  actor: { userId: string; workspaceId: string },
  target: { projectId: string; shareId: string },
  recipients: readonly string[],
  now: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    await audit(
      tx,
      {
        actorUserId: actor.userId,
        workspaceId: actor.workspaceId,
        action: "share.invites_sent",
        target: { type: "project", id: target.projectId },
        fields: ["invites"],
        meta: { shareId: target.shareId, recipients },
      },
      now,
    );
    const { rows } = await tx.query<{ invited_count: number }>(
      `UPDATE squint_shares SET invited_count = (
         SELECT count(DISTINCT recipient)::int
         FROM audit_log, jsonb_array_elements_text(audit_log.meta->'recipients') AS recipient
         WHERE audit_log.workspace_id = $1 AND audit_log.action = 'share.invites_sent'
           AND audit_log.meta->>'shareId' = $2
       )
       WHERE id = $2 RETURNING invited_count`,
      [actor.workspaceId, target.shareId],
    );
    return Number(rows[0]?.invited_count ?? 0);
  });
}

export type InviteOutcome =
  | { ok: true; sent: number; invitedCount: number }
  | {
      ok: false;
      reason: "not-found" | "link-closed" | "review-closed" | "email-off" | "send-failed";
    }
  | { ok: false; reason: "members-only"; addresses: string[] }
  | { ok: false; reason: "rate-limited"; retryAfterSeconds: number };

export interface InviteDeps {
  send: SendInvites;
  env?: EmailEnv;
  secret?: string;
}

/**
 * Emails the invitation of a live project's review link to `addresses`
 * (already normalized, valid and deduped). In order: the link must exist
 * (`not-found`), open (`link-closed`: its project archived) and take comments
 * (`review-closed`); on a preview, every address must be a member's
 * (`members-only`, listing the others); then the addresses' HMACs (no
 * `AUTH_SECRET`: it throws, nothing sent), the rate limits (`rate-limited`),
 * the send itself (`send-failed`: Resend refused, logged without addresses),
 * and finally the record. Never the password, only whether there is one.
 */
export async function sendInvites(
  db: Database,
  actor: { userId: string; workspaceId: string },
  projectId: string,
  addresses: readonly string[],
  now: number,
  { send, env = process.env, secret = env.AUTH_SECRET }: InviteDeps,
): Promise<InviteOutcome> {
  const { workspaceId } = actor;
  const target = await inviteTarget(db, workspaceId, projectId);
  if (!target) return { ok: false, reason: "not-found" };
  if (target.archived_at !== null) return { ok: false, reason: "link-closed" };
  const reviewEndsAt = reviewDeadline(Number(target.created_at), target.review_window_hours);
  if (reviewClosed(reviewEndsAt, now)) return { ok: false, reason: "review-closed" };
  if (emailOff(env)) return { ok: false, reason: "email-off" };
  if (membersOnly(env)) {
    const outside = await nonMembers(db, workspaceId, addresses);
    if (outside.length) return { ok: false, reason: "members-only", addresses: outside };
  }
  const recipients = addresses.map((address) => inviteeKey(address, secret));
  const sealedTo = linkSecretContext(workspaceId, projectId, "token");
  const token = openSecret(target.token_sealed, sealedTo, secret);
  const claim = await claimInviteSends(db, actor, addresses.length, now);
  if (!claim.ok)
    return { ok: false, reason: "rate-limited", retryAfterSeconds: claim.retryAfterSeconds };
  const details: InviteDetails = {
    company: target.company,
    project: target.project_name,
    client: target.client_name,
    link: new URL(`/s/${token}`, authOrigin(env)).toString(),
    reviewEndsAt,
    hasPassword: target.password_set_at !== null,
  };
  // The email's icon is the link's own (`/api/s/<token>/brand/icon`), as previews show it.
  const color = brandColor(target.brand_color);
  const shown = toClientBrand({
    custom: true,
    name: target.company,
    color,
    logoKey: target.logo_key,
  });
  const brand: InviteBrand = {
    iconUrl: new URL(brandIconPath(token, shown), authOrigin(env)).toString(),
    color,
  };
  const from = workspaceFromHeader(
    { fromEmailName: target.from_email_name, workspaceName: target.company },
    env.EMAIL_FROM,
  );
  try {
    await send({ to: addresses, from, details, brand });
  } catch (error) {
    console.error(`squint share: invites not sent (${describeError(error)})`);
    return { ok: false, reason: "send-failed" };
  }
  const shareTarget = { projectId, shareId: target.share_id };
  const invitedCount = await recordInvites(db, actor, shareTarget, recipients, now);
  return { ok: true, sent: addresses.length, invitedCount };
}
