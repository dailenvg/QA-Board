import { audit } from "../../account/audit";
import { scrubAccount } from "../../account/account-purge";
import { hashPassword } from "../../auth/password";
import { knownSwitches, type MemberSwitch } from "../../auth/permissions";
import { createSession } from "../../auth/sessions";
import type { SessionUser } from "../../auth/users";
import type { Database } from "../../db/database";
import type { Queryable } from "../../share/migrate";
import { hashSecret } from "../../share/tokens";
import type { BlobLocation } from "../../share/types";
import { toLocation } from "../blobs";
import { toDate, toMs } from "../times";
import { discardQuietly } from "../workspace-purge";
import { lockMembers, lockOpenWorkspace } from "./locks";
import { activeMembers } from "./seats";

/**
 * Joining a workspace with an invite's link (4.2): signed in as the invited
 * address, or as a new person with a name and password. In one transaction,
 * in the members lock order: L1, L2 (the address's account, if any), L4, L5
 * (the invite), then every check again. The account the address has decides
 * what happens: a new one is made; a signed-in one joins; one removed from
 * here, or deleted by its owner while a member here, comes back (revived) if
 * still in its grace; any other deleted one is scrubbed and replaced.
 */

export type AcceptRefusal =
  /** Unknown token, or its workspace has closed: the same answer, naming nothing. */
  | "not-found"
  | "expired"
  | "cancelled"
  | "used"
  /** The workspace has no seat left (its limit was lowered, or a restore went over). */
  | "seats-full"
  /** Signed in as someone other than the invited address. */
  | "wrong-account"
  /** Signed in as the admin. */
  | "cannot-join"
  /** Signed in as the invited address, which already belongs to another workspace. */
  | "in-another-workspace"
  /** The address has an account that can sign in: sign in, then accept. */
  | "sign-in-first"
  /** The address's account is being deleted while it belongs to another workspace. */
  | "account-closing";

export interface NewAccount {
  /** Already checked (`displayNameError`) and trimmed. */
  name: string;
  /** Already checked (`newPasswordError`). */
  password: string;
}

/** Who accepts: the signed-in user (that path always wins), or a person without a session. */
export type Joiner = { session: SessionUser } | { account: NewAccount };

export type AcceptResult =
  | {
      ok: true;
      workspaceId: string;
      /** A new session to set as the cookie, for someone who wasn't signed in; null otherwise. */
      sessionToken: string | null;
    }
  | { ok: false; reason: AcceptRefusal };

export interface AcceptServices {
  /** Where avatars live: a revived or replaced account's old one is discarded. */
  blobs: { discard(locations: readonly BlobLocation[]): Promise<void> };
}

interface InviteRef {
  id: string;
  workspace_id: string;
  email: string;
}

interface InviteState {
  accepted: boolean;
  revoked: boolean;
  expires_at: Date;
  permissions: string[];
}

interface AccountRow {
  id: string;
  role: "admin" | "company";
  deleted: boolean;
  delete_after: Date | null;
  removed_from: string | null;
  removed_permissions: string[] | null;
}

interface MembershipRow {
  workspace_id: string;
  permissions: string[];
}

/** The invite behind `token`, read without a lock, to learn its workspace before L1. */
async function findInvite(db: Queryable, token: string): Promise<InviteRef | null> {
  const { rows } = await db.query<InviteRef>(
    "SELECT id, workspace_id, email FROM workspace_invites WHERE token_hash = $1",
    [hashSecret(token)],
  );
  return rows[0] ?? null;
}

/** L2: the address's account, whatever its state. */
async function lockAccount(tx: Queryable, email: string): Promise<AccountRow | null> {
  const { rows } = await tx.query<AccountRow>(
    `SELECT id, role, deleted_at IS NOT NULL AS deleted, delete_after, removed_from,
       removed_permissions
     FROM users WHERE email = $1 FOR UPDATE`,
    [email],
  );
  return rows[0] ?? null;
}

/** L5: the invite, then why it can't be used now, if it can't. */
async function lockInvite(
  tx: Queryable,
  id: string,
  now: number,
): Promise<{ ok: true; grants: MemberSwitch[] } | { ok: false; reason: AcceptRefusal }> {
  const { rows } = await tx.query<InviteState>(
    `SELECT accepted_at IS NOT NULL AS accepted, revoked_at IS NOT NULL AS revoked, expires_at,
       permissions
     FROM workspace_invites WHERE id = $1 FOR UPDATE`,
    [id],
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: "not-found" };
  if (row.accepted) return { ok: false, reason: "used" };
  if (row.revoked) return { ok: false, reason: "cancelled" };
  if (toMs(row.expires_at) <= now) return { ok: false, reason: "expired" };
  return { ok: true, grants: knownSwitches(row.permissions) };
}

async function membershipsOf(tx: Queryable, userId: string): Promise<MembershipRow[]> {
  const { rows } = await tx.query<MembershipRow>(
    "SELECT workspace_id, permissions FROM memberships WHERE user_id = $1",
    [userId],
  );
  return rows;
}

/** What the account comes to, for a person without a session. */
type Plan =
  | { kind: "create" }
  | { kind: "revive"; userId: string; previous: string[] | null }
  | { kind: "replace"; userId: string; previous: string[] | null };

/**
 * 4.2's account table, for a person without a session. An account that can
 * sign in is never given a password here (`sign-in-first`).
 */
function planAccount(
  account: AccountRow | null,
  memberships: readonly MembershipRow[],
  workspaceId: string,
  now: number,
): Plan | AcceptRefusal {
  if (!account) return { kind: "create" };
  if (!account.deleted || account.role === "admin") return "sign-in-first";
  if (memberships.some((row) => row.workspace_id !== workspaceId)) return "account-closing";
  const inGrace = account.delete_after !== null && toMs(account.delete_after) > now;
  const here = memberships.find((row) => row.workspace_id === workspaceId);
  const removedHere = account.removed_from === workspaceId;
  // Their switches here before, which the invite's can only narrow: the membership they kept
  // when they deleted their own account, or the ones their removal from here recorded.
  const previous = here?.permissions ?? (removedHere ? account.removed_permissions : null);
  return (here || removedHere) && inGrace
    ? { kind: "revive", userId: account.id, previous }
    : { kind: "replace", userId: account.id, previous };
}

/** The invite's switches, narrowed to `previous` when the account had some here. */
function grantsFor(invite: readonly MemberSwitch[], previous: readonly string[] | null) {
  return previous ? invite.filter((value) => previous.includes(value)) : [...invite];
}

/** A new company account for the address, or null when another accept made one first. */
async function insertAccount(
  tx: Queryable,
  email: string,
  account: NewAccount,
  passwordHash: string,
): Promise<string | null> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'company')
     ON CONFLICT (email) DO NOTHING RETURNING id`,
    [email, passwordHash, account.name],
  );
  return rows[0]?.id ?? null;
}

/**
 * Brings a deleted account back as the person who accepted: their new name
 * and password, no deletion date, no removal, and no avatar (whoever has the
 * link may not be who had the account). Answers the old avatar's files.
 */
async function reviveAccount(
  tx: Queryable,
  userId: string,
  account: NewAccount,
  passwordHash: string,
  now: number,
): Promise<BlobLocation[]> {
  await tx.query(
    `UPDATE users SET name = $2, password_hash = $3, deleted_at = NULL, delete_after = NULL,
       removed_from = NULL, removed_permissions = NULL, avatar_blob_key = NULL
     WHERE id = $1`,
    [userId, account.name, passwordHash],
  );
  const { rows } = await tx.query<{ bytes: Uint8Array | null; blob_url: string | null }>(
    "DELETE FROM user_blobs WHERE user_id = $1 RETURNING bytes, blob_url",
    [userId],
  );
  await audit(
    tx,
    {
      actorUserId: userId,
      action: "user.restored",
      target: { type: "user", id: userId },
      fields: ["deleted_at", "delete_after", "removed_from", "name", "password", "avatar"],
    },
    now,
  );
  return rows.map(toLocation);
}

/** The person's membership with `grants`, made or (for a member coming back) narrowed. */
async function join(
  tx: Queryable,
  userId: string,
  invite: InviteRef,
  grants: readonly MemberSwitch[],
  now: number,
): Promise<void> {
  await tx.query(
    `INSERT INTO memberships (user_id, workspace_id, role, permissions)
     VALUES ($1, $2, 'member', $3::text[])
     ON CONFLICT (user_id, workspace_id) DO UPDATE SET permissions = EXCLUDED.permissions
       WHERE memberships.role = 'member'`,
    [userId, invite.workspace_id, [...grants]],
  );
  await markAccepted(tx, invite.id, userId, now);
  await audit(
    tx,
    {
      actorUserId: userId,
      workspaceId: invite.workspace_id,
      action: "membership.added",
      target: { type: "user", id: userId },
      fields: ["membership"],
      meta: { source: "invite" },
    },
    now,
  );
}

async function markAccepted(tx: Queryable, inviteId: string, userId: string, now: number) {
  await tx.query(
    "UPDATE workspace_invites SET accepted_at = $2, accepted_user_id = $3 WHERE id = $1",
    [inviteId, toDate(now), userId],
  );
}

type Step =
  | { ok: true; userId: string; files: BlobLocation[]; signIn: boolean }
  | { ok: false; reason: AcceptRefusal };

/** What both paths know once L1 to L5 are held. */
interface Locked {
  invite: InviteRef;
  /** The address's account (L2), whatever its state; null without one. */
  existing: AccountRow | null;
  grants: readonly MemberSwitch[];
  /** Whether the workspace has fewer active members than seats. */
  seatFree: boolean;
}

/** The signed-in path: the session's own account joins, or is told why not. */
async function acceptSignedIn(
  tx: Queryable,
  { invite, existing, grants, seatFree }: Locked,
  session: SessionUser,
  now: number,
): Promise<Step> {
  if (!existing || existing.id !== session.id || existing.deleted) {
    return { ok: false, reason: "wrong-account" };
  }
  const memberships = await membershipsOf(tx, existing.id);
  if (memberships.some((row) => row.workspace_id !== invite.workspace_id)) {
    return { ok: false, reason: "in-another-workspace" };
  }
  if (memberships.length > 0) {
    // Already in (a restore beat them to it): the link is used, nothing else changes.
    await markAccepted(tx, invite.id, existing.id, now);
    return { ok: true, userId: existing.id, files: [], signIn: false };
  }
  if (!seatFree) return { ok: false, reason: "seats-full" };
  await join(tx, existing.id, invite, grants, now);
  return { ok: true, userId: existing.id, files: [], signIn: false };
}

/** The signed-out path: 4.2's account table (`planAccount`), then the membership. */
async function acceptNew(
  tx: Queryable,
  { invite, existing, grants, seatFree }: Locked,
  { account, passwordHash }: { account: NewAccount; passwordHash: string },
  now: number,
): Promise<Step> {
  const memberships = existing ? await membershipsOf(tx, existing.id) : [];
  const plan = planAccount(existing, memberships, invite.workspace_id, now);
  if (typeof plan === "string") return { ok: false, reason: plan };
  if (!seatFree) return { ok: false, reason: "seats-full" };
  let userId: string | null;
  let files: BlobLocation[] = [];
  if (plan.kind === "revive") {
    userId = plan.userId;
    files = await reviveAccount(tx, userId, account, passwordHash, now);
  } else {
    if (plan.kind === "replace") files = await scrubAccount(tx, plan.userId, now);
    userId = await insertAccount(tx, invite.email, account, passwordHash);
  }
  // Another workspace's invite made this address's account first: it can sign in now.
  if (!userId) return { ok: false, reason: "sign-in-first" };
  const previous = plan.kind === "create" ? null : plan.previous;
  await join(tx, userId, invite, grantsFor(grants, previous), now);
  return { ok: true, userId, files, signIn: true };
}

/**
 * L1, L2 (the address's account), L4 (the workspace, open) and L5 (the
 * invite, usable), in that order, then the seat check; or why not.
 */
async function lockAll(
  tx: Queryable,
  invite: InviteRef,
  now: number,
): Promise<{ ok: true; locked: Locked } | { ok: false; reason: AcceptRefusal }> {
  await lockMembers(tx, invite.workspace_id);
  const existing = await lockAccount(tx, invite.email);
  const workspace = await lockOpenWorkspace(tx, invite.workspace_id);
  if (!workspace) return { ok: false, reason: "not-found" };
  const state = await lockInvite(tx, invite.id, now);
  if (!state.ok) return state;
  // The invite held a seat; this only makes sure a lowered limit holds.
  const seatFree = (await activeMembers(tx, invite.workspace_id)) < workspace.seatLimit;
  return { ok: true, locked: { invite, existing, grants: state.grants, seatFree } };
}

/** Why `joiner` can't accept an invite to `invite.email`, judged before any lock. */
function refuseSession(joiner: Joiner, invite: InviteRef): AcceptRefusal | null {
  if (!("session" in joiner)) return null;
  if (joiner.session.role === "admin") return "cannot-join";
  return joiner.session.email === invite.email ? null : "wrong-account";
}

/**
 * Accepts the invite behind `token` for `joiner`. Signed in, the session's
 * account joins (never created or changed); otherwise the address's account
 * is made, revived or replaced (4.2), signed in with a new session. The
 * member joins with the invite's switches, narrowed to those they had here
 * before when the account comes back, and never more. Opening a link never
 * accepts it: only this does, once.
 */
export async function acceptInvite(
  db: Database,
  token: string,
  joiner: Joiner,
  now: number,
  services: AcceptServices,
): Promise<AcceptResult> {
  const invite = await findInvite(db, token);
  if (!invite) return { ok: false, reason: "not-found" };
  const refused = refuseSession(joiner, invite);
  if (refused) return { ok: false, reason: refused };
  // Hashed before any lock is taken: Argon2 is slow on purpose.
  const path =
    "session" in joiner
      ? joiner
      : { account: joiner.account, passwordHash: await hashPassword(joiner.account.password) };
  const result = await db.transaction(async (tx) => {
    const held = await lockAll(tx, invite, now);
    if (!held.ok) return held;
    const step =
      "session" in path
        ? await acceptSignedIn(tx, held.locked, path.session, now)
        : await acceptNew(tx, held.locked, path, now);
    if (!step.ok) return step;
    const sessionToken = step.signIn ? await createSession(tx, step.userId, now) : null;
    return { ...step, sessionToken };
  });
  if (!result.ok) return result;
  await discardQuietly("avatar", services.blobs, result.files);
  return { ok: true, workspaceId: invite.workspace_id, sessionToken: result.sessionToken };
}
