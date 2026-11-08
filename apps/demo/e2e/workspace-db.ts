import { Client } from "pg";
import { brandLogoPath } from "../lib/workspace/blob-paths";
import { E2E_COMPANY, e2eDatabaseUrl } from "./e2e-env";

/**
 * Direct access to the e2e workspace in the local e2e database
 * (`E2E_DATABASE_URL`, refused unless it's on this machine): its id, and an
 * empty start for each test. Content goes in through the server
 * (`squint-fixtures.ts`), as a browser would put it there.
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

let cachedId: string | null = null;

/** The e2e company's workspace id, created by the global setup's seed. */
export async function e2eWorkspaceId(): Promise<string> {
  cachedId ??= await withClient(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM workspaces WHERE slug = $1",
      [E2E_COMPANY.slug],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error("The e2e workspace isn't seeded.");
    return id;
  });
  return cachedId;
}

/**
 * Empties the workspace (folders, projects and everything in them, files,
 * share links), forgets the owner's comment name and puts its brand back to
 * the seed's (name only, no logo or color), so each test starts as a first
 * visit did. Accounts and sessions stay.
 */
export async function resetWorkspace(): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `TRUNCATE folders, projects, workspace_blobs, squint_shares RESTART IDENTITY CASCADE`,
    );
    await client.query("UPDATE storage_usage SET bytes = 0, blob_count = 0");
    await client.query("UPDATE users SET name = NULL");
    await client.query(
      "UPDATE workspaces SET name = $2, logo_blob_key = NULL, brand_color = NULL WHERE slug = $1",
      [E2E_COMPANY.slug, E2E_COMPANY.name],
    );
  });
}

/**
 * Gives the e2e workspace a brand color and a logo, stored as the settings
 * page will store it (a `workspace_blobs` row with no project, bytes inline
 * on the e2e server), until the next `resetWorkspace`.
 */
export async function brandWorkspace({
  color,
  logo,
  logoId = "e2e-logo",
}: {
  color: string;
  logo: Buffer;
  logoId?: string;
}): Promise<void> {
  const workspaceId = await e2eWorkspaceId();
  const key = brandLogoPath(workspaceId, logoId);
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO workspace_blobs (workspace_id, key, project_id, content_type, size, bytes)
       VALUES ($1, $2, NULL, 'image/png', $3, $4)`,
      [workspaceId, key, logo.length, logo],
    );
    await client.query("UPDATE workspaces SET logo_blob_key = $2, brand_color = $3 WHERE id = $1", [
      workspaceId,
      key,
      color,
    ]);
  });
}

/** Every account's id: none may reach a guest. */
export async function userIds(): Promise<string[]> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ id: string }>("SELECT id FROM users");
    return rows.map((row) => row.id);
  });
}

/** How many rows of `table` belong to the e2e workspace (its projects' rows, for project tables). */
export async function workspaceRows(
  table: "projects" | "comments" | "snapshots" | "workspace_blobs",
): Promise<number> {
  const workspaceId = await e2eWorkspaceId();
  return withClient(async (client) => {
    const scoped =
      table === "projects" || table === "workspace_blobs"
        ? `SELECT count(*)::int AS count FROM ${table} WHERE workspace_id = $1`
        : `SELECT count(*)::int AS count FROM ${table} AS row
           JOIN projects AS project ON project.id = row.project_id WHERE project.workspace_id = $1`;
    const { rows } = await client.query<{ count: number }>(scoped, [workspaceId]);
    return rows[0]?.count ?? 0;
  });
}

/** A share's workspace and deletion date: null `expiresAt` means it no longer deletes itself. */
export async function shareRow(
  shareId: string,
): Promise<{ workspaceId: string | null; expiresAt: string | null } | null> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ workspace_id: string | null; expires_at: string | null }>(
      "SELECT workspace_id, expires_at FROM squint_shares WHERE id = $1",
      [shareId],
    );
    const row = rows[0];
    return row ? { workspaceId: row.workspace_id, expiresAt: row.expires_at } : null;
  });
}

/**
 * A project `id` in another workspace (made once, kept across tests until
 * `resetWorkspace` empties projects), as an import from another account
 * would leave it.
 */
export async function addProjectElsewhere(id: string): Promise<void> {
  await withClient(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO workspaces (slug, name) VALUES ('e2e-elsewhere', 'Elsewhere')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    const workspaceId = rows[0]?.id;
    await client.query(
      `INSERT INTO folders (workspace_id, id, parent_id, name) VALUES ($1, 'elsewhere', NULL, 'Elsewhere')
       ON CONFLICT DO NOTHING`,
      [workspaceId],
    );
    await client.query(
      `INSERT INTO projects (id, workspace_id, folder_id, name, source)
       VALUES ($1, $2, 'elsewhere', 'Theirs', '{"kind":"url","url":"https://example.com/"}')`,
      [id, workspaceId],
    );
  });
}
