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
    for (const table of ["sessions", "email_changes", "password_resets"]) {
      await client.query(`DELETE FROM ${table} WHERE user_id = ${SPARE_ID}`);
    }
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
