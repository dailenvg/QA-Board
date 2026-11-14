import { readFileSync } from "node:fs";
import { expect } from "@playwright/test";
import { Client } from "pg";
import { clickUpTokenContext } from "../lib/integrations/clickup/connections";
import { sealSecret } from "../lib/workspace/sealed-secrets";
import { CLICKUP_STUB_URL, E2E_AUTH_SECRET, e2eDatabaseUrl } from "./e2e-env";
import { e2eWorkspaceId } from "./workspace-db";

/**
 * The fake ClickUp the e2e server talks to (`clickup-stub.mjs`): the personal
 * tokens it knows, whose they are, their ClickUp workspaces, and the first
 * one's people and chat channels. Test values only, shaped like real tokens.
 */
export const CLICKUP_STUB = JSON.parse(
  readFileSync(new URL("./clickup-tokens.json", import.meta.url), "utf8"),
) as {
  ONE_WORKSPACE: string;
  TWO_WORKSPACES: string;
  USER: { id: number; username: string };
  TEAMS: Array<{ id: string; name: string }>;
  MEMBERS: Array<{ id: number; username: string; email: string }>;
  CHANNELS: Array<{ id: string; name: string; type: string }>;
};

/** A message the stub took: the channel it went to, and the body as the app sent it. */
export interface StubMessage {
  channelId: string;
  body: {
    type: string;
    content: string;
    content_format: string;
    assignee?: string;
    followers?: string[];
  };
}

async function stub(path: string, body?: unknown): Promise<Response> {
  const response = await fetch(`${CLICKUP_STUB_URL}/__test/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  expect(response.ok).toBe(true);
  return response;
}

/** Forgets what the stub was sent, and takes every token it knows again. */
export async function resetClickUpStub(): Promise<void> {
  await stub("reset", {});
}

/** What the stub was sent since its last reset, oldest first. */
export async function stubMessages(): Promise<StubMessage[]> {
  return ((await (await stub("messages")).json()) as { messages: StubMessage[] }).messages;
}

/** The stub refuses `token` from now on (until a reset), as ClickUp does a regenerated one. */
export async function revokeClickUpToken(token: string): Promise<void> {
  await stub("revoke", { token });
}

/** The stub deletes channel `id` (until a reset): gone from the list, a 404 on posting. */
export async function removeStubChannel(id: string): Promise<void> {
  await stub("remove-channel", { id });
}

/** The stub answers a post to channel `id` with a 403 (until a reset), as for a channel closed to the member. */
export async function forbidStubChannel(id: string): Promise<void> {
  await stub("forbid-channel", { id });
}

/** The stub fails the next `count` channel list reads with a 500 (until a reset). */
export async function failStubChannelLists(count: number): Promise<void> {
  await stub("fail-lists", { count });
}

/**
 * Connects the e2e workspace owner's own ClickUp to the stub's first
 * workspace with `token`, in the database as the profile card would (its
 * route allows 20 tries per user in 10 minutes, fewer than the specs make).
 */
export async function connectClickUp(token: string = CLICKUP_STUB.ONE_WORKSPACE): Promise<void> {
  const workspaceId = await e2eWorkspaceId();
  const [team] = CLICKUP_STUB.TEAMS;
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query<{ user_id: string }>(
      "SELECT user_id FROM memberships WHERE workspace_id = $1 AND role = 'owner'",
      [workspaceId],
    );
    const userId = rows[0]?.user_id ?? "";
    const sealed = sealSecret(token, clickUpTokenContext({ userId, workspaceId }), E2E_AUTH_SECRET);
    await client.query(
      `INSERT INTO user_clickup_connections (user_id, workspace_id, clickup_team_id,
         clickup_team_name, clickup_user_id, clickup_username, access_token_sealed)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        workspaceId,
        team?.id,
        team?.name,
        String(CLICKUP_STUB.USER.id),
        CLICKUP_STUB.USER.username,
        sealed,
      ],
    );
  } finally {
    await client.end();
  }
}

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
