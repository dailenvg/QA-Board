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

/** A workspace of the test's own, for the admin to act on, with its owner's sign-in. */
export interface AdminTestWorkspace {
  workspaceId: string;
  name: string;
  email: string;
  password: string;
}

let workspaces = 0;

/**
 * A new workspace with an owner who can sign in, made straight in the e2e
 * database as the seed script makes one. Each call makes another, so
 * suspending or archiving it never touches what other specs use.
 */
export async function createAdminTestWorkspace(label: string): Promise<AdminTestWorkspace> {
  workspaces += 1;
  const tag = `${label}-${Date.now().toString(36)}-${workspaces}`.toLowerCase();
  const account = {
    email: `admin-test-${tag}@e2e.test`,
    password: "e2e admin test password",
    name: `Admin Test ${tag}`,
  };
  const passwordHash = await hashPassword(account.password);
  return withClient(async (client) => {
    const { rows: users } = await client.query<{ id: string }>(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'company') RETURNING id",
      [account.email, passwordHash],
    );
    const { rows: created } = await client.query<{ id: string }>(
      "INSERT INTO workspaces (slug, name) VALUES ($1, $2) RETURNING id",
      [`e2e-admin-${tag}`.replace(/[^a-z0-9-]/g, "-").slice(0, 48), account.name],
    );
    const workspaceId = created[0]?.id ?? "";
    await client.query(
      "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'owner')",
      [users[0]?.id, workspaceId],
    );
    return { ...account, workspaceId };
  });
}

/** The workspace's storage quota, in bytes. */
export async function storageQuota(workspaceId: string): Promise<number> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ bytes: string }>(
      "SELECT storage_quota_bytes AS bytes FROM workspaces WHERE id = $1",
      [workspaceId],
    );
    return Number(rows[0]?.bytes);
  });
}

/** Schedules the workspace for deletion, as its owner deleting their account does (033). */
export async function scheduleWorkspaceDeletion(workspaceId: string): Promise<void> {
  await withClient((client) =>
    client.query("UPDATE workspaces SET delete_after = now() + interval '30 days' WHERE id = $1", [
      workspaceId,
    ]),
  );
}
