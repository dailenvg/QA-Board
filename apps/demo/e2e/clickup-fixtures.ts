import { readFileSync } from "node:fs";
import { Client } from "pg";
import { e2eDatabaseUrl } from "./e2e-env";
import { e2eWorkspaceId } from "./workspace-db";

/**
 * The fake ClickUp the e2e server talks to (`clickup-stub.mjs`): the personal
 * tokens it knows, whose they are, and their ClickUp workspaces. Test values
 * only, shaped like real tokens.
 */
export const CLICKUP_STUB = JSON.parse(
  readFileSync(new URL("./clickup-tokens.json", import.meta.url), "utf8"),
) as {
  ONE_WORKSPACE: string;
  TWO_WORKSPACES: string;
  USER: { id: number; username: string };
  TEAMS: Array<{ id: string; name: string }>;
};

/** Shaped like a personal token, but the stub doesn't know it: ClickUp's 401. */
export const UNKNOWN_TOKEN = `pk_1003_${"C".repeat(32)}`;

/** A member of the e2e workspace who doesn't own it, for as long as `run` takes. */
export const CLICKUP_MEMBER_EMAIL = "clickup-member@e2e.test";

export async function withWorkspaceMember(run: () => Promise<void>): Promise<void> {
  const workspaceId = await e2eWorkspaceId();
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    await client.query(
      `WITH member AS (
         INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'company') RETURNING id
       )
       INSERT INTO memberships (user_id, workspace_id, role)
       SELECT id, $2, 'member' FROM member`,
      [CLICKUP_MEMBER_EMAIL, workspaceId],
    );
    await run();
  } finally {
    // Gone again (memberships and sessions with it), so other specs can still delete the owner.
    await client.query("DELETE FROM users WHERE email = $1", [CLICKUP_MEMBER_EMAIL]);
    await client.end();
  }
}
