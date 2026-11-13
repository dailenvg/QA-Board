import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { callAccount } from "@/test/account-routes";
import { insertUser } from "@/test/accounts-fixture";
import { migratedPglite } from "@/test/pglite";
import { seat, TEST_AUTH_SECRET, type Seat } from "@/test/workspace-fixture";
import { createSession } from "../../auth/sessions";
import type { Database } from "../../db/database";
import { openSecret } from "../../workspace/sealed-secrets";
import { clickUpTokenContext } from "./connections";
import { loadClickUpSection } from "./section";

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

const PATH = "/api/account/workspace/integrations/clickup";
const API = "https://api.clickup.com/api/v2";
const TOKEN = `pk_81_${"A1b2".repeat(8)}`;

const ACME = { id: "9012", name: "Acme Design" };
const SIDE = { id: "9013", name: "Side Projects" };

/** What the fake ClickUp knows: the token it takes, whose it is, and its workspaces. */
let clickUp: { token: string; teams: Array<{ id: string; name: string }>; status?: number };
let clickUpCalls: string[];

/** The app passes ClickUp's URLs as strings. */
function fakeClickUp(href: string, init?: RequestInit): Promise<Response> {
  clickUpCalls.push(href);
  const auth = new Headers(init?.headers).get("authorization");
  if (clickUp.status) return Promise.resolve(Response.json({}, { status: clickUp.status }));
  if (auth !== clickUp.token) {
    return Promise.resolve(
      Response.json({ err: "Token invalid", ECODE: "OAUTH_025" }, { status: 401 }),
    );
  }
  if (href === `${API}/user`) {
    return Promise.resolve(Response.json({ user: { id: 81, username: "Ana Ruiz" } }));
  }
  if (href === `${API}/team`) return Promise.resolve(Response.json({ teams: clickUp.teams }));
  return Promise.resolve(Response.json({}, { status: 404 }));
}

let db: Database;
let a: Seat;
let b: Seat;

beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
  vi.stubEnv("CLICKUP_API_URL", "");
  vi.stubGlobal("fetch", vi.fn(fakeClickUp));
  clickUp = { token: TOKEN, teams: [ACME] };
  clickUpCalls = [];
  db = await migratedPglite();
  holder.db = db;
  a = await seat(db, "acme");
  b = await seat(db, "bravo");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function connect(cookie: string, body: Record<string, unknown>) {
  return callAccount("POST", PATH, { cookie, body });
}

async function rows() {
  const { rows: found } = await db.query<{
    workspace_id: string;
    clickup_team_id: string;
    clickup_team_name: string;
    clickup_user_id: string;
    clickup_username: string;
    access_token_sealed: string;
    connected_by: string | null;
  }>("SELECT * FROM workspace_clickup_connections ORDER BY workspace_id");
  return found;
}

async function auditActions() {
  const { rows: found } = await db.query<{ action: string; workspace_id: string; meta: unknown }>(
    "SELECT action, workspace_id, meta FROM audit_log WHERE action LIKE 'workspace.clickup%' ORDER BY id",
  );
  return found;
}

/** A member of `a`'s workspace who doesn't own it, signed in. */
async function member(): Promise<{ userId: string; cookie: string }> {
  const userId = await insertUser(db, "member@acme.test");
  await db.query(
    "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'member')",
    [userId, a.workspaceId],
  );
  return { userId, cookie: `squint_session=${await createSession(db, userId, Date.now())}` };
}

describe("POST /api/account/workspace/integrations/clickup", () => {
  it("connects the token's only ClickUp workspace to the session's workspace, sealing the token", async () => {
    const response = await connect(a.cookie, { token: ` ${TOKEN}\n`, workspaceId: b.workspaceId });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(TOKEN);
    expect(JSON.parse(text)).toEqual({
      connection: {
        teamName: "Acme Design",
        clickUpUsername: "Ana Ruiz",
        connectedBy: expect.stringMatching(/@acme\.test$/) as unknown,
        connectedAt: expect.any(Number) as unknown,
      },
    });
    expect(clickUpCalls).toEqual([`${API}/user`, `${API}/team`]);
    const [row] = await rows();
    expect(await rows()).toHaveLength(1);
    expect(row).toMatchObject({
      workspace_id: a.workspaceId,
      clickup_team_id: "9012",
      clickup_team_name: "Acme Design",
      clickup_user_id: "81",
      clickup_username: "Ana Ruiz",
      connected_by: a.userId,
    });
    expect(row?.access_token_sealed).not.toContain(TOKEN);
    const sealed = row?.access_token_sealed ?? "";
    expect(openSecret(sealed, clickUpTokenContext(a.workspaceId), TEST_AUTH_SECRET)).toBe(TOKEN);
    expect(() =>
      openSecret(sealed, clickUpTokenContext(b.workspaceId), TEST_AUTH_SECRET),
    ).toThrow();
    expect(await auditActions()).toEqual([
      {
        action: "workspace.clickup_connected",
        workspace_id: a.workspaceId,
        meta: { fields: ["clickup"] },
      },
    ]);
  });

  it("asks which ClickUp workspace when the token reaches several, saving nothing until one is picked", async () => {
    clickUp.teams = [ACME, SIDE];
    const ask = await connect(a.cookie, { token: TOKEN });
    expect(ask.status).toBe(200);
    expect(await ask.json()).toEqual({ choose: [ACME, SIDE] });
    expect(await rows()).toEqual([]);

    const unknown = await connect(a.cookie, { token: TOKEN, teamId: "4040" });
    expect(unknown.status).toBe(409);
    expect(await unknown.json()).toEqual({ error: "unknown-team", teams: [ACME, SIDE] });
    expect(await rows()).toEqual([]);

    const picked = await connect(a.cookie, { token: TOKEN, teamId: SIDE.id });
    expect(picked.status).toBe(200);
    expect(await rows()).toMatchObject([
      { clickup_team_id: SIDE.id, clickup_team_name: SIDE.name },
    ]);
  });

  it("replaces an earlier connection, and records each", async () => {
    await connect(a.cookie, { token: TOKEN });
    clickUp.teams = [SIDE];
    await connect(a.cookie, { token: TOKEN });
    expect(await rows()).toMatchObject([{ clickup_team_id: SIDE.id }]);
    expect((await auditActions()).map(({ action }) => action)).toEqual([
      "workspace.clickup_connected",
      "workspace.clickup_connected",
    ]);
  });

  it("refuses a token ClickUp won't take, one that reaches nothing, or a ClickUp that's down", async () => {
    clickUp.token = `pk_81_${"Z".repeat(32)}`;
    const refused = await connect(a.cookie, { token: TOKEN });
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({ error: "refused" });

    clickUp = { token: TOKEN, teams: [] };
    const none = await connect(a.cookie, { token: TOKEN });
    expect(none.status).toBe(422);
    expect(await none.json()).toEqual({ error: "no-workspace" });

    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    clickUp.status = 500;
    const down = await connect(a.cookie, { token: TOKEN });
    expect(down.status).toBe(502);
    expect(await down.json()).toEqual({ error: "unreachable" });
    expect(logged).toHaveBeenCalledWith(
      "squint clickup: token check failed (ClickUpError: GET /user answered 500)",
    );
    expect(JSON.stringify(logged.mock.calls)).not.toContain(TOKEN);

    expect(await rows()).toEqual([]);
    expect(await auditActions()).toEqual([]);
  });

  it("refuses a token that isn't pk_… without asking ClickUp", async () => {
    for (const token of ["", "pk_81_short", `sk_81_${"A".repeat(32)}`, 42]) {
      const response = await connect(a.cookie, { token });
      expect(response.status, String(token)).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid", field: "token" });
    }
    expect(clickUpCalls).toEqual([]);
  });

  it("is the owner's only: a member gets a 403, and ClickUp is never asked", async () => {
    const response = await connect((await member()).cookie, { token: TOKEN });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "owner-only" });
    expect(clickUpCalls).toEqual([]);
    expect(await rows()).toEqual([]);
  });

  it("answers 503 when this site can't reach ClickUp", async () => {
    vi.stubEnv("CLICKUP_API_URL", "http://evil.test");
    const response = await connect(a.cookie, { token: TOKEN });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(clickUpCalls).toEqual([]);
  });

  it("stops a user after 20 tries in 10 minutes, with when to try again", async () => {
    clickUp.token = `pk_81_${"Z".repeat(32)}`;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect((await connect(b.cookie, { token: TOKEN })).status).toBe(422);
    }
    const limited = await connect(b.cookie, { token: TOKEN });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: "rate-limited" });
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(clickUpCalls).toHaveLength(20);
    // Another user's budget is their own.
    expect((await connect(a.cookie, { token: TOKEN })).status).toBe(422);
  });
});

describe("DELETE /api/account/workspace/integrations/clickup", () => {
  it("disconnects the session's workspace only, and records it", async () => {
    await connect(a.cookie, { token: TOKEN });
    await connect(b.cookie, { token: TOKEN });
    const response = await callAccount("DELETE", PATH, { cookie: a.cookie });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect((await rows()).map(({ workspace_id }) => workspace_id)).toEqual([b.workspaceId]);
    expect((await auditActions()).at(-1)).toEqual({
      action: "workspace.clickup_disconnected",
      workspace_id: a.workspaceId,
      meta: { fields: ["clickup"] },
    });
  });

  it("records nothing when there was nothing to disconnect, and refuses a member", async () => {
    expect((await callAccount("DELETE", PATH, { cookie: a.cookie })).status).toBe(200);
    expect(await auditActions()).toEqual([]);
    await connect(a.cookie, { token: TOKEN });
    const refused = await callAccount("DELETE", PATH, { cookie: (await member()).cookie });
    expect(refused.status).toBe(403);
    expect(await rows()).toHaveLength(1);
  });
});

describe("the settings page's ClickUp row", () => {
  it("shows the connection to every member, never the token", async () => {
    expect(await loadClickUpSection(db, a.workspaceId, API)).toEqual({ kind: "disconnected" });
    expect(await loadClickUpSection(db, a.workspaceId, null)).toEqual({ kind: "unavailable" });
    await connect(a.cookie, { token: TOKEN });
    const section = await loadClickUpSection(db, a.workspaceId, null);
    expect(section).toMatchObject({
      kind: "connected",
      connection: { teamName: "Acme Design", clickUpUsername: "Ana Ruiz" },
    });
    expect(JSON.stringify(section)).not.toContain(TOKEN);
  });

  it("names whoever connected it by name, and nobody once their account is deleted", async () => {
    await db.query("UPDATE users SET name = 'Owen' WHERE id = $1", [a.userId]);
    await connect(a.cookie, { token: TOKEN });
    expect(await loadClickUpSection(db, a.workspaceId, API)).toMatchObject({
      connection: { connectedBy: "Owen" },
    });
    await db.query("UPDATE users SET deleted_at = now() WHERE id = $1", [a.userId]);
    expect(await loadClickUpSection(db, a.workspaceId, API)).toMatchObject({
      connection: { connectedBy: null },
    });
  });
});
