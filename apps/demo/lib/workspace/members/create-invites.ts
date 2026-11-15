import { randomUUID } from "node:crypto";
import { audit } from "../../account/audit";
import { emailError, normalizeEmail } from "../../auth/field-rules";
import { can, type MemberSwitch } from "../../auth/permissions";
import type { Database } from "../../db/database";
import type { Queryable } from "../../share/migrate";
import { createSecret, hashSecret } from "../../share/tokens";
import { sealSecret } from "../sealed-secrets";
import { toDate } from "../times";
import { claimInviteEmails, type InviteEmailClaim } from "./invite-sends";
import {
  deliverInvites,
  INVITE_TTL_MS,
  inviteEmailEnabled,
  inviteGrants,
  inviterName,
  inviteSecretContext,
  joinLink,
  openInviteToken,
  type InviteDeps,
  type InvitingWorkspace,
  type OutgoingInvite,
} from "./invites";
import { actorAccess, lockMembers, lockOpenWorkspace } from "./locks";
import { seatsLeft, seatsUsed, type Seats } from "./seats";

/**
 * Inviting people into a workspace (4.1): several addresses in one request,
 * each judged on its own, then the whole request against the seats left and
 * the day's email limit, in one transaction under the members lock. Emails go
 * after it commits.
 */

/** Why one address wasn't invited. The others in the request still are. */
export type InviteAddressError =
  "invalid" | "already-member" | "already-invited" | "in-another-workspace" | "cannot-invite";

export type InviteResult =
  | {
      email: string;
      ok: true;
      invite: { id: string; link: string; expiresAt: number };
      emailed: boolean;
    }
  | { email: string; ok: false; error: InviteAddressError };

export type CreateInvitesOutcome =
  | { ok: true; results: InviteResult[]; seats: Seats }
  /** The actor may no longer invite (`members.manage`), or the workspace has closed. */
  | { ok: false; reason: "not-allowed" | "not-found" }
  | { ok: false; reason: "seats-full"; seats: Seats }
  | ({ ok: false; reason: "rate-limited" } & Omit<Extract<InviteEmailClaim, { ok: false }>, "ok">);

/** What one address comes to before anything is written. */
type Verdict =
  | { kind: "refused"; error: Exclude<InviteAddressError, "invalid"> }
  | { kind: "new" }
  /** An open invite that has expired: same link, 7 more days, a seat again. */
  | { kind: "renew"; id: string };

/** An address as the request gave it: normalised when it's an email. */
interface Address {
  email: string;
  valid: boolean;
}

/** The request's addresses, normalised, in order, each once. */
export function readAddresses(emails: readonly string[]): Address[] {
  const seen = new Map<string, Address>();
  for (const raw of emails) {
    const valid = emailError(raw) === null;
    const email = valid ? normalizeEmail(raw) : raw.trim();
    if (!seen.has(email)) seen.set(email, { email, valid });
  }
  return [...seen.values()];
}

interface PersonRow {
  email: string;
  role: "admin" | "company";
  deleted: boolean;
  here: boolean;
  elsewhere: boolean;
}

interface OpenInviteRow {
  id: string;
  email: string;
  live: boolean;
}

/**
 * Section 2's rules for each of `emails` in the workspace at `now`. Read
 * without row locks: L1 already serialises this workspace, and accepting
 * locks the user row (L2), so a race across workspaces ends there.
 */
async function judge(
  tx: Queryable,
  workspaceId: string,
  emails: readonly string[],
  now: number,
): Promise<Map<string, Verdict>> {
  const { rows: people } = await tx.query<PersonRow>(
    `SELECT u.email, u.role, u.deleted_at IS NOT NULL AS deleted,
       EXISTS (SELECT 1 FROM memberships WHERE user_id = u.id AND workspace_id = $2) AS here,
       EXISTS (SELECT 1 FROM memberships WHERE user_id = u.id AND workspace_id <> $2) AS elsewhere
     FROM users AS u WHERE u.email = ANY($1::text[])`,
    [[...emails], workspaceId],
  );
  const { rows: invites } = await tx.query<OpenInviteRow>(
    `SELECT id, email, expires_at > $3 AS live FROM workspace_invites
     WHERE workspace_id = $2 AND email = ANY($1::text[])
       AND accepted_at IS NULL AND revoked_at IS NULL`,
    [[...emails], workspaceId, toDate(now)],
  );
  const person = new Map(people.map((row) => [row.email, row]));
  const invite = new Map(invites.map((row) => [row.email, row]));
  return new Map(emails.map((email) => [email, verdict(person.get(email), invite.get(email))]));
}

function verdict(person: PersonRow | undefined, invite: OpenInviteRow | undefined): Verdict {
  if (person?.role === "admin") return { kind: "refused", error: "cannot-invite" };
  // A member here who deleted their own account (still in their 30 days) may be invited back.
  if (person?.here && !person.deleted) return { kind: "refused", error: "already-member" };
  if (person?.elsewhere) return { kind: "refused", error: "in-another-workspace" };
  if (invite?.live) return { kind: "refused", error: "already-invited" };
  return invite ? { kind: "renew", id: invite.id } : { kind: "new" };
}

interface Actor {
  userId: string;
  workspaceId: string;
}

/** A new invite for `email`: a fresh token, sealed to the row, and the inviter's grants. */
async function insertInvite(
  tx: Queryable,
  actor: Actor,
  email: string,
  grants: readonly MemberSwitch[],
  now: number,
  secret: string | undefined,
): Promise<OutgoingInvite> {
  const id = randomUUID();
  const token = createSecret();
  await tx.query(
    `INSERT INTO workspace_invites (id, workspace_id, email, token_hash, token_sealed, invited_by,
       created_at, expires_at, permissions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[])`,
    [
      id,
      actor.workspaceId,
      email,
      hashSecret(token),
      sealSecret(token, inviteSecretContext(actor.workspaceId, id), secret),
      actor.userId,
      toDate(now),
      toDate(now + INVITE_TTL_MS),
      [...grants],
    ],
  );
  return { id, email, token };
}

/**
 * An expired open invite made live again: the same link for 7 more days, its
 * grants unchanged; a new one if the daily cleanup deleted it meanwhile.
 */
async function renewInvite(
  tx: Queryable,
  actor: Actor,
  { id, email }: { id: string; email: string },
  grants: readonly MemberSwitch[],
  now: number,
  secret: string | undefined,
): Promise<OutgoingInvite> {
  const { rows } = await tx.query<{ token_sealed: string }>(
    `UPDATE workspace_invites SET expires_at = $3
     WHERE id = $1 AND workspace_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL
     RETURNING token_sealed`,
    [id, actor.workspaceId, toDate(now + INVITE_TTL_MS)],
  );
  const sealed = rows[0]?.token_sealed;
  if (!sealed) return insertInvite(tx, actor, email, grants, now, secret);
  return { id, email, token: openInviteToken(sealed, actor.workspaceId, id, secret) };
}

type Planned =
  | Exclude<CreateInvitesOutcome, { ok: true }>
  | {
      ok: true;
      verdicts: Map<string, Verdict>;
      made: Map<string, OutgoingInvite>;
      seats: Seats;
      workspace: InvitingWorkspace;
      inviter: string | null;
    };

/** The transaction: L1, the actor again, L4, then the rules, the limits and the rows (L5). */
async function plan(
  tx: Queryable,
  actor: Actor,
  emails: readonly string[],
  now: number,
  { emailOn, secret }: { emailOn: boolean; secret: string | undefined },
): Promise<Planned> {
  await lockMembers(tx, actor.workspaceId);
  const access = await actorAccess(tx, actor.userId, actor.workspaceId);
  if (!access || !can(access, "members.manage")) return { ok: false, reason: "not-allowed" };
  const open = await lockOpenWorkspace(tx, actor.workspaceId);
  if (!open) return { ok: false, reason: "not-found" };
  const verdicts = await judge(tx, actor.workspaceId, emails, now);
  const taking = emails.filter((email) => verdicts.get(email)?.kind !== "refused");
  const seats = { used: await seatsUsed(tx, actor.workspaceId, now), limit: open.seatLimit };
  if (taking.length > seatsLeft(seats)) return { ok: false, reason: "seats-full", seats };
  if (emailOn && taking.length > 0) {
    const claim = await claimInviteEmails(tx, actor.workspaceId, taking.length, now);
    if (!claim.ok) {
      const { retryAfterSeconds, sentInWindow, limit } = claim;
      return { ok: false, reason: "rate-limited", retryAfterSeconds, sentInWindow, limit };
    }
  }
  const grants = inviteGrants(access);
  const made = new Map<string, OutgoingInvite>();
  for (const email of taking) {
    const judged = verdicts.get(email);
    const invite =
      judged?.kind === "renew"
        ? await renewInvite(tx, actor, { id: judged.id, email }, grants, now, secret)
        : await insertInvite(tx, actor, email, grants, now, secret);
    made.set(email, invite);
    await audit(
      tx,
      {
        actorUserId: actor.userId,
        workspaceId: actor.workspaceId,
        action: "member.invited",
        target: { type: "invite", id: invite.id },
        fields: judged?.kind === "renew" ? ["expires_at"] : ["invite"],
      },
      now,
    );
  }
  return {
    ok: true,
    verdicts,
    made,
    seats: { used: seats.used + taking.length, limit: seats.limit },
    workspace: { id: actor.workspaceId, ...open },
    inviter: await inviterName(tx, actor.userId),
  };
}

/**
 * Invites `emails` (as typed: normalised and deduped here) into the actor's
 * workspace, as section 2's rules and 4.1 say. Refuses the whole request,
 * writing nothing, when the actor may no longer invite (re-checked under L1),
 * when the workspace has closed, when those that pass need more seats than
 * are left, or more emails than the day's limit has left. Otherwise makes or
 * renews one invite per address that passes, then emails them in one batch
 * (when email is on) and answers each address's result, in order.
 */
export async function createInvites(
  db: Database,
  actor: Actor,
  emails: readonly string[],
  now: number,
  deps: InviteDeps,
): Promise<CreateInvitesOutcome> {
  const { env = process.env, secret = env.AUTH_SECRET } = deps;
  const addresses = readAddresses(emails);
  const valid = addresses.filter((address) => address.valid).map((address) => address.email);
  const emailOn = inviteEmailEnabled(env);
  const planned = await db.transaction((tx) => plan(tx, actor, valid, now, { emailOn, secret }));
  if (!planned.ok) return planned;
  const outgoing = [...planned.made.values()];
  const emailed = await deliverInvites(db, planned.workspace, planned.inviter, outgoing, now, deps);
  const expiresAt = now + INVITE_TTL_MS;
  const results = addresses.map((address): InviteResult => {
    if (!address.valid) return { email: address.email, ok: false, error: "invalid" };
    const invite = planned.made.get(address.email);
    if (invite) {
      const link = joinLink(invite.token, env);
      return {
        email: address.email,
        ok: true,
        invite: { id: invite.id, link, expiresAt },
        emailed,
      };
    }
    const judged = planned.verdicts.get(address.email);
    return {
      email: address.email,
      ok: false,
      error: judged?.kind === "refused" ? judged.error : "invalid",
    };
  });
  return { ok: true, results, seats: planned.seats };
}
