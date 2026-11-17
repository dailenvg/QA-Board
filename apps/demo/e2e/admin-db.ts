import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { hashPassword } from "../lib/auth/password";
import { E2E_ADMIN, E2E_COMPANY, e2eDatabaseUrl } from "./e2e-env";

/**
 * Direct access to the e2e admin and the audit log in the local e2e database,
 * for the admin panel's spec: the admin's password as seeded (another spec
 * resets it), and a trail of entries of its own to filter and page through.
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

/** The admin's password as the seed set it, with no failed sign-ins on record. */
export async function resetAdminPassword(): Promise<void> {
  const passwordHash = await hashPassword(E2E_ADMIN.password);
  await withClient(async (client) => {
    await client.query("UPDATE users SET password_hash = $2 WHERE email = $1", [
      E2E_ADMIN.email,
      passwordHash,
    ]);
    await client.query("DELETE FROM login_attempts WHERE email = $1", [E2E_ADMIN.email]);
  });
}

/** An audit trail in a workspace that no longer exists (the log keeps its id). */
export interface AuditTrail {
  workspaceId: string;
  /** How many entries the e2e owner made in it, and how many Squint did after. */
  byOwner: number;
  bySquint: number;
}

/**
 * `byOwner` settings changes by the e2e owner, a minute apart, then one
 * project deletion by Squint, all in a fresh workspace id with no workspace
 * behind it, so no other spec's entries match its filter.
 */
export async function seedAuditTrail(byOwner: number): Promise<AuditTrail> {
  const workspaceId = randomUUID();
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO audit_log (actor_user_id, workspace_id, action, target_type, target_id, meta, at)
       SELECT owner.id, $1::uuid, 'workspace.settings_changed', 'workspace', $1::text,
         '{"fields":["name"]}'::jsonb, now() - (n || ' minutes')::interval
       FROM generate_series(1, $2::int) AS n,
         (SELECT id FROM users WHERE email = $3) AS owner`,
      [workspaceId, byOwner, E2E_COMPANY.email],
    );
    await client.query(
      `INSERT INTO audit_log (workspace_id, action, target_type, target_id, meta)
       VALUES ($1::uuid, 'project.deleted', 'project', 'gone-project', '{"fields":["project"]}')`,
      [workspaceId],
    );
  });
  return { workspaceId, byOwner, bySquint: 1 };
}
