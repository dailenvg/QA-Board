import type { MemberSwitch } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/users";
import type { Database } from "@/lib/db/database";
import type { BlobLocation } from "@/lib/share/types";
import type { Queryable } from "@/lib/share/migrate";
import { createInvites, type InviteResult } from "@/lib/workspace/members/create-invites";
import type { MemberInviteBatch } from "@/lib/workspace/members/invite-email";
import type { InviteDeps } from "@/lib/workspace/members/invites";
import { removeMember as removeFromWorkspace } from "@/lib/workspace/members/remove-member";
import { insertSession } from "@/test/sessions-fixture";
import { insertUser } from "./accounts-fixture";
import { migratedPglite } from "./pglite";
import { TEST_AUTH_SECRET } from "./workspace-fixture";

/**
 * Workspaces with people for the invite, join and removal tests: an owner
 * who can sign in, a second workspace that must never change, and helpers to
 * invite, accept and remove.
 */

export const SITE = "https://squint.test";

/** Email on: Resend is set up (a stub stands in for it). */
export const EMAIL_ON = {
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "Squint <noreply@squint.test>",
  AUTH_URL: SITE,
  AUTH_SECRET: TEST_AUTH_SECRET,
};

/** Local development without Resend: invites are made, nothing is sent. */
export const EMAIL_OFF = { AUTH_URL: SITE, AUTH_SECRET: TEST_AUTH_SECRET };

/** A Vercel preview with Resend: still never emails anyone outside the workspace. */
export const PREVIEW = { ...EMAIL_ON, VERCEL: "1", VERCEL_ENV: "preview" };

export interface Person {
  user: SessionUser;
  /** Their browser's `Cookie` header. */
  cookie: string;
}

export interface MembersWorld {
  db: Database;
  workspaceId: string;
  owner: Person;
  /** Another workspace and its owner. */
  other: { workspaceId: string; owner: Person };
}

export const WORKSPACE = "Acme Studio";
export const OWNER_NAME = "Ana Ruiz";

let people = 0;

/** A company account that can sign in (`PASSWORD`), with a session. */
export async function person(
  db: Queryable,
  email = `person-${(people += 1)}@people.test`,
  name: string | null = null,
): Promise<Person> {
  const id = await insertUser(db, email);
  if (name) await db.query("UPDATE users SET name = $2 WHERE id = $1", [id, name]);
  const token = await insertSession(db, id, Date.now());
  return { user: { id, email, name, role: "company" }, cookie: `squint_session=${token}` };
}

async function workspace(db: Queryable, slug: string, name: string, owner: Person) {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ($1, $2) RETURNING id",
    [slug, name],
  );
  const id = rows[0]?.id ?? "";
  await db.query("INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'owner')", [
    owner.user.id,
    id,
  ]);
  return id;
}

/** Acme Studio, owned by Ana, and Bravo, owned by someone else. */
export async function membersWorld(db?: Database): Promise<MembersWorld> {
  const database = db ?? (await migratedPglite());
  const owner = await person(database, `ana-${(people += 1)}@acme.test`, OWNER_NAME);
  const slug = `acme-${people}`;
  const workspaceId = await workspace(database, slug, WORKSPACE, owner);
  const otherOwner = await person(database, `bo-${(people += 1)}@bravo.test`);
  const otherId = await workspace(database, `bravo-${people}`, "Bravo", otherOwner);
  return {
    db: database,
    workspaceId,
    owner,
    other: { workspaceId: otherId, owner: otherOwner },
  };
}

/** A member of `workspaceId` who can sign in, with `permissions`. */
export async function addMember(
  db: Queryable,
  workspaceId: string,
  permissions: readonly MemberSwitch[] = ["review_links", "trash", "import"],
  email?: string,
): Promise<Person> {
  const member = await person(db, email);
  await db.query(
    `INSERT INTO memberships (user_id, workspace_id, role, permissions)
     VALUES ($1, $2, 'member', $3::text[])`,
    [member.user.id, workspaceId, [...permissions]],
  );
  return member;
}

/** What the stub sender was given, batch by batch; `fail` makes it refuse. */
export function stubSender(fail = false) {
  const batches: MemberInviteBatch[] = [];
  const send = (batch: MemberInviteBatch) => {
    batches.push(batch);
    return fail ? Promise.reject(new Error("refused")) : Promise.resolve();
  };
  return { send, batches };
}

/** Deps with email `env` (off by default) and a stub sender. */
export function deps(env: Record<string, string> = EMAIL_OFF, fail = false) {
  const stub = stubSender(fail);
  const value: InviteDeps = { send: stub.send, env, secret: env.AUTH_SECRET };
  return { ...value, batches: stub.batches };
}

/** The token in an invite's link. */
export function tokenOf(result: InviteResult | undefined): string {
  if (!result?.ok) throw new Error(`not invited: ${JSON.stringify(result)}`);
  return result.invite.link.split("/").at(-1) ?? "";
}

/** Invites one address as `actor` and answers its token. */
export async function inviteOne(
  world: Pick<MembersWorld, "db" | "workspaceId">,
  actor: Person,
  email: string,
  now: number,
  env: Record<string, string> = EMAIL_OFF,
): Promise<string> {
  const made = await createInvites(
    world.db,
    { userId: actor.user.id, workspaceId: world.workspaceId },
    [email],
    now,
    deps(env),
  );
  if (!made.ok) throw new Error(`not invited: ${JSON.stringify(made)}`);
  return tokenOf(made.results[0]);
}

/**
 * Takes `userId` out of `workspaceId` as its owner does (4.5, `removeMember`):
 * the membership goes, and the account is deleted with 24 hours of grace,
 * remembering where from and with which switches.
 */
export async function removeMember(
  db: Database,
  userId: string,
  workspaceId: string,
  now: number,
): Promise<void> {
  const { rows } = await db.query<{ user_id: string }>(
    "SELECT user_id FROM memberships WHERE workspace_id = $1 AND role = 'owner'",
    [workspaceId],
  );
  const owner = { userId: rows[0]?.user_id ?? "", workspaceId };
  const outcome = await removeFromWorkspace(db, owner, userId, now);
  if (!outcome.ok) throw new Error(`not removed: ${outcome.reason}`);
}

/** A member's switches in a workspace, or null without a membership. */
export async function switchesOf(db: Queryable, userId: string, workspaceId: string) {
  const { rows } = await db.query<{ permissions: string[] }>(
    "SELECT permissions FROM memberships WHERE user_id = $1 AND workspace_id = $2",
    [userId, workspaceId],
  );
  return rows[0]?.permissions ?? null;
}

/** An avatar file blobs can be asked to discard. */
export const AVATAR_URL = "https://blob.test/user/old-avatar";

/** Gives `userId` an avatar stored in Vercel Blob at `AVATAR_URL`. */
export async function giveAvatar(db: Queryable, userId: string): Promise<void> {
  const key = `user/${userId}/avatar/a1`;
  await db.query(
    `INSERT INTO user_blobs (user_id, key, content_type, size, blob_url)
     VALUES ($1, $2, 'image/png', 12, $3)`,
    [userId, key, AVATAR_URL],
  );
  await db.query("UPDATE users SET avatar_blob_key = $2 WHERE id = $1", [userId, key]);
}

/** A blob store that records what it was asked to discard. */
export function discardLog() {
  const discarded: BlobLocation[] = [];
  return {
    discarded,
    blobs: {
      discard: (locations: readonly BlobLocation[]) => {
        discarded.push(...locations);
        return Promise.resolve();
      },
    },
  };
}
