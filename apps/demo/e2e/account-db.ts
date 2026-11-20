import { createHash, randomBytes } from "node:crypto";
import { Client } from "pg";
import { hashPassword } from "../lib/auth/password";
import { E2E_SPARE, e2eDatabaseUrl } from "./e2e-env";

/**
 * Direct access to the spare account (`E2E_SPARE`) in the local e2e
 * database: putting it back as seeded, and what the account specs check or
 * can't get from an email. The spare is found by its workspace, since a spec
 * changes its email.
 */

async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

const SPARE_ID = `(SELECT m.user_id FROM memberships AS m JOIN workspaces AS w ON w.id = m.workspace_id
  WHERE w.slug = '${E2E_SPARE.slug}' AND m.role = 'owner')`;

/**
 * The spare account as the seed made it: its email and password, no name, no
 * sessions, no pending email changes or reset links, and no failed sign-ins.
 */
export async function resetSpareAccount(): Promise<void> {
  const passwordHash = await hashPassword(E2E_SPARE.password);
  await withClient(async (client) => {
    const { rows } = await client.query<{ email: string }>(
      `SELECT email FROM users WHERE id = ${SPARE_ID}`,
    );
    const current = rows[0]?.email ?? E2E_SPARE.email;
    await client.query(
      `UPDATE users SET email = $1, password_hash = $2, name = NULL WHERE id = ${SPARE_ID}`,
      [E2E_SPARE.email, passwordHash],
    );
    for (const table of ["sessions", "email_changes"]) {
      await client.query(`DELETE FROM ${table} WHERE user_id = ${SPARE_ID}`);
    }
    await client.query(`DELETE FROM verifications WHERE value = ${SPARE_ID}::text`);
    await client.query("DELETE FROM login_attempts WHERE email = ANY($1)", [
      [E2E_SPARE.email, current],
    ]);
  });
}

/**
 * A usable email change link moving the spare account to `newEmail`, written
 * straight into the e2e database (the e2e server sends no email, and only the
 * token's hash is stored). Returns the link's path.
 */
export async function createEmailChangeLink(newEmail: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await withClient((client) =>
    client.query(
      `INSERT INTO email_changes (user_id, new_email, token_hash, expires_at)
       VALUES (${SPARE_ID}, $1, $2, now() + interval '1 hour')`,
      [newEmail, createHash("sha256").update(token).digest("hex")],
    ),
  );
  return `/email-change/${token}`;
}

/** Whether the email change link at `path` is still unused. */
export async function emailChangeUnused(path: string): Promise<boolean> {
  const token = path.split("/").at(-1) ?? "";
  return withClient(async (client) => {
    const { rows } = await client.query(
      "SELECT 1 FROM email_changes WHERE token_hash = $1 AND used_at IS NULL",
      [createHash("sha256").update(token).digest("hex")],
    );
    return rows.length === 1;
  });
}

/** How many sessions the spare account has. */
export async function spareSessions(): Promise<number> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM sessions WHERE user_id = ${SPARE_ID}`,
    );
    return rows[0]?.count ?? 0;
  });
}

/** A throwaway account for the specs that delete one: never the e2e owner, the spare or the admin. */
export interface DisposableAccount {
  email: string;
  password: string;
  workspaceId: string;
  workspaceName: string;
}

let disposables = 0;

/** A unique tag per call: the run's time, a counter, and `label` (the Playwright project). */
function disposableTag(label: string): string {
  disposables += 1;
  return `${label}-${Date.now().toString(36)}-${disposables}`.toLowerCase();
}

/**
 * A new company account that owns a workspace of its own, made straight in
 * the e2e database as the seed script makes one. Each call makes another, so
 * deleting it never touches what other specs share.
 */
export async function createDisposableOwner(label: string): Promise<DisposableAccount> {
  const tag = disposableTag(label);
  const account = {
    email: `delete-${tag}@e2e.test`,
    password: "e2e disposable password",
    workspaceName: `Delete Me ${tag}`,
  };
  const passwordHash = await hashPassword(account.password);
  return withClient(async (client) => {
    const { rows: users } = await client.query<{ id: string }>(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'company') RETURNING id",
      [account.email, passwordHash],
    );
    const { rows: workspaces } = await client.query<{ id: string }>(
      "INSERT INTO workspaces (slug, name) VALUES ($1, $2) RETURNING id",
      [`e2e-delete-${tag}`.replace(/[^a-z0-9-]/g, "-").slice(0, 48), account.workspaceName],
    );
    const workspaceId = workspaces[0]?.id ?? "";
    await client.query(
      "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'owner')",
      [users[0]?.id, workspaceId],
    );
    return { ...account, workspaceId };
  });
}

/** Who a disposable member is: their name, and the owner's switches for them (041's default without). */
export interface MemberOptions {
  name?: string;
  permissions?: readonly string[];
}

/** A new member of `owner`'s workspace, who can sign in with the owner's password. */
export async function addDisposableMember(
  owner: DisposableAccount,
  label: string,
  { name, permissions }: MemberOptions = {},
): Promise<DisposableAccount> {
  const email = `member-${disposableTag(label)}@e2e.test`;
  const passwordHash = await hashPassword(owner.password);
  await withClient(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      "INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, 'company', $3) RETURNING id",
      [email, passwordHash, name ?? null],
    );
    await client.query(
      `INSERT INTO memberships (user_id, workspace_id, role, permissions)
       VALUES ($1, $2, 'member', COALESCE($3::text[], ARRAY['review_links', 'trash', 'import']))`,
      [rows[0]?.id, owner.workspaceId, permissions ? [...permissions] : null],
    );
  });
  return { ...owner, email };
}

/** Gives the account with `email` a name, as its Profile would. */
export async function nameAccount(email: string, name: string): Promise<void> {
  await withClient((client) =>
    client.query("UPDATE users SET name = $2 WHERE email = $1", [email, name]),
  );
}

/** When the account with `email` and its workspace are due to be deleted for good (null: they aren't). */
export async function deletionDates(
  email: string,
  workspaceId: string,
): Promise<{ user: Date | null; workspace: Date | null }> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ user: Date | null; workspace: Date | null }>(
      `SELECT (SELECT delete_after FROM users WHERE email = $1) AS user,
              (SELECT delete_after FROM workspaces WHERE id = $2) AS workspace`,
      [email, workspaceId],
    );
    return rows[0] ?? { user: null, workspace: null };
  });
}

/** Sets how many seats `workspaceId` has, as the Squint admin's SQL snippet does. */
export async function setSeatLimit(workspaceId: string, limit: number): Promise<void> {
  await withClient((client) =>
    client.query("UPDATE workspaces SET seat_limit = $2 WHERE id = $1", [workspaceId, limit]),
  );
}

/** Moves `email`'s open invite to `workspaceId` a day past its expiry. */
export async function expireInvite(workspaceId: string, email: string): Promise<void> {
  await withClient((client) =>
    client.query(
      `UPDATE workspace_invites SET expires_at = now() - interval '1 day'
       WHERE workspace_id = $1 AND email = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
      [workspaceId, email],
    ),
  );
}

/** Deletes `email`'s account as its owner would (033): 30 days to go, its membership kept. */
export async function scheduleOwnDeletion(email: string): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `UPDATE users SET deleted_at = now(), delete_after = now() + interval '30 days'
       WHERE email = $1`,
      [email],
    );
    await client.query(
      "DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = $1)",
      [email],
    );
  });
}

/** Sets a member's switches straight in the database, as the owner's Members page would. */
export async function setMemberSwitches(
  email: string,
  permissions: readonly string[],
): Promise<void> {
  await withClient((client) =>
    client.query(
      `UPDATE memberships SET permissions = $2::text[]
       WHERE user_id = (SELECT id FROM users WHERE email = $1) AND role = 'member'`,
      [email, [...permissions]],
    ),
  );
}

/** A new company account in no workspace, signing in with `password`. */
export async function createLoneAccount(email: string, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await withClient((client) =>
    client.query("INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'company')", [
      email,
      passwordHash,
    ]),
  );
}

/** A unique address for someone not yet in Squint, tagged with `label` (the Playwright project). */
export function newAddress(label: string): string {
  return `new-${disposableTag(label)}@e2e.test`;
}
