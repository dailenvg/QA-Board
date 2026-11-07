import { Client } from "pg";
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
 * share links) and forgets the owner's comment name, so each test starts as
 * a first visit did. Accounts and sessions stay.
 */
export async function resetWorkspace(): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `TRUNCATE folders, projects, workspace_blobs, squint_shares RESTART IDENTITY CASCADE`,
    );
    await client.query("UPDATE storage_usage SET bytes = 0, blob_count = 0");
    await client.query("UPDATE users SET name = NULL");
  });
}
