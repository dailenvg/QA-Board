import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { insertUser } from "@/test/accounts-fixture";
import { migratedPglite } from "@/test/pglite";
import { seat, TEST_AUTH_SECRET, type Seat } from "@/test/workspace-fixture";
import { call } from "@/test/workspace-routes";
import { createSession } from "../../auth/sessions";
import type { Database } from "../../db/database";
import { sealSecret } from "../../workspace/sealed-secrets";
import { clickUpTokenContext, legacyClickUpTokenContext } from "./connections";

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

const API = "https://api.clickup.com/api";
const TOKEN = `pk_81_${"A1b2".repeat(8)}`;
const TEAM = "9012";
const CHANNELS = `${API}/v3/workspaces/${TEAM}/chat/channels`;
const MEMBERS = [
  { user: { id: 81, username: "Ana Ruiz", email: "ana@acme.test" } },
  { user: { id: 82, username: "Bo Chen", email: "bo@acme.test" } },
];

/** What the fake ClickUp does: the token it takes, and a status to answer every call with. */
let clickUp: { token: string; status?: number; messageUrl?: string };
let clickUpCalls: Array<{ method: string; href: string; body: unknown }>;

function fakeClickUp(href: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? "GET";
  const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  clickUpCalls.push({ method, href, body });
  if (clickUp.status)
    return Promise.resolve(Response.json({ err: TOKEN }, { status: clickUp.status }));
  if (new Headers(init?.headers).get("authorization") !== clickUp.token) {
    return Promise.resolve(Response.json({ err: "Token invalid" }, { status: 401 }));
  }
  if (href === `${API}/v2/team`) {
    return Promise.resolve(
      Response.json({ teams: [{ id: TEAM, name: "Acme Design", members: MEMBERS }] }),
    );
  }
  if (href.startsWith(`${CHANNELS}?`)) {
    return Promise.resolve(
      Response.json({
        data: [
          { id: "c-2", name: "design", type: "CHANNEL" },
          { id: "c-1", name: "Announcements", type: "CHANNEL" },
          { id: "dm", name: "Bo", type: "DM" },
        ],
        next_cursor: null,
      }),
    );
  }
  if (method === "POST" && href === `${CHANNELS}/c-1/messages`) {
    return Promise.resolve(Response.json({ id: "m-1", url: clickUp.messageUrl }));
  }
  return Promise.resolve(Response.json({ err: "Not found" }, { status: 404 }));
}

let db: Database;
let a: Seat;
let b: Seat;

beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
  vi.stubEnv("AUTH_URL", "https://squint.test");
  vi.stubEnv("CLICKUP_API_URL", "");
  vi.stubGlobal("fetch", vi.fn(fakeClickUp));
  clickUp = { token: TOKEN };
  clickUpCalls = [];
  db = await migratedPglite();
  holder.db = db;
  a = await seat(db, "acme");
  b = await seat(db, "bravo");
  await addProject(a.workspaceId, "p1", "Home [page] *v2*");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function addProject(workspaceId: string, id: string, name: string) {
  await db.query(
    `INSERT INTO projects (id, workspace_id, name, source)
     VALUES ($1, $2, $3, '{"kind":"url","url":"https://a.test/"}')`,
    [id, workspaceId, name],
  );
}

/** Connects `seat`'s member to ClickUp as the profile card would have (sealed to them). */
async function connect(who: { userId: string; workspaceId: string }) {
  await db.query(
    `INSERT INTO user_clickup_connections (user_id, workspace_id, clickup_team_id,
       clickup_team_name, clickup_user_id, clickup_username, access_token_sealed)
     VALUES ($1, $2, $3, 'Acme Design', '81', 'Ana Ruiz', $4)`,
    [
      who.userId,
      who.workspaceId,
      TEAM,
      sealSecret(TOKEN, clickUpTokenContext(who), TEST_AUTH_SECRET),
    ],
  );
}

const channels = (who: Seat) =>
  call("GET", `/api/w/${who.workspaceId}/clickup/channels`, { cookie: who.cookie });
const people = (who: Seat) =>
  call("GET", `/api/w/${who.workspaceId}/clickup/people`, { cookie: who.cookie });
const send = (who: Seat, body: unknown, projectId = "p1") =>
  call("POST", `/api/w/${who.workspaceId}/projects/${projectId}/clickup`, {
    cookie: who.cookie,
    body,
  });

async function sends() {
  const { rows } = await db.query<{
    actor_user_id: string;
    workspace_id: string;
    target_id: string;
    meta: unknown;
  }>(
    `SELECT actor_user_id, workspace_id, target_id, meta FROM audit_log
     WHERE action = 'project.clickup_sent' ORDER BY id`,
  );
  return rows;
}

describe("GET /api/w/<id>/clickup/channels and /people", () => {
  it("lists the member's channels and ClickUp people with their own token, never the token", async () => {
    await connect(a);
    const listed = await channels(a);
    expect(listed.status).toBe(200);
    expect(listed.headers.get("cache-control")).toBe("no-store");
    expect(await listed.json()).toEqual({
      channels: [
        { id: "c-1", name: "Announcements" },
        { id: "c-2", name: "design" },
      ],
    });
    const found = await people(a);
    const text = await found.text();
    expect(text).not.toContain(TOKEN);
    expect(JSON.parse(text)).toEqual({
      people: [
        { id: "81", username: "Ana Ruiz", email: "ana@acme.test" },
        { id: "82", username: "Bo Chen", email: "bo@acme.test" },
      ],
    });
  });

  it("says when the member isn't connected, without asking ClickUp", async () => {
    await connect(b);
    for (const response of [await channels(a), await people(a)]) {
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "not-connected" });
    }
    expect(clickUpCalls).toEqual([]);
  });

  it("asks them to reconnect when ClickUp refuses the token, and logs nothing of it", async () => {
    await connect(a);
    clickUp.token = `pk_81_${"Z".repeat(32)}`;
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const refused = await channels(a);
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({ error: "reconnect" });
    expect(logged).not.toHaveBeenCalled();
    // A token sealed for someone else (or with another AUTH_SECRET) reads as one to reconnect too.
    await db.query("UPDATE user_clickup_connections SET access_token_sealed = $1", [
      sealSecret(TOKEN, clickUpTokenContext(b), TEST_AUTH_SECRET),
    ]);
    expect((await people(a)).status).toBe(422);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(TOKEN);
  });

  it("asks them to reconnect on a 403 too: reading, it's the token's", async () => {
    await connect(a);
    clickUp.status = 403;
    const refused = await channels(a);
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({ error: "reconnect" });
  });

  it("answers 502 when ClickUp is down, logging the call and status only", async () => {
    await connect(a);
    clickUp.status = 500;
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const down = await channels(a);
    expect(down.status).toBe(502);
    expect(await down.json()).toEqual({ error: "unreachable" });
    expect(logged).toHaveBeenCalledWith(
      `squint clickup: channels read failed (ClickUpError: GET /v3/workspaces/${TEAM}/chat/channels answered 500)`,
    );
    expect(JSON.stringify(logged.mock.calls)).not.toContain(TOKEN);
  });

  it("refuses everyone outside the workspace, and a workspace waiting to be deleted", async () => {
    await connect(a);
    const outsider = await call("GET", `/api/w/${a.workspaceId}/clickup/channels`, {
      cookie: b.cookie,
    });
    expect(outsider.status).toBe(404);
    await db.query(
      "UPDATE workspaces SET delete_after = now() + interval '30 days' WHERE id = $1",
      [a.workspaceId],
    );
    expect((await channels(a)).status).toBe(404);
    expect((await send(a, { channelId: "c-1" })).status).toBe(404);
    expect(clickUpCalls).toEqual([]);
  });

  it("answers 503 when this site can't reach ClickUp", async () => {
    await connect(a);
    vi.stubEnv("CLICKUP_API_URL", "http://evil.test");
    const response = await channels(a);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });

  it("stops a member after 60 list reads in 10 minutes", async () => {
    await connect(b);
    for (let read = 0; read < 30; read += 1) {
      expect((await channels(b)).status).toBe(200);
      expect((await people(b)).status).toBe(200);
    }
    const limited = await channels(b);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("POST /api/w/<id>/projects/<id>/clickup", () => {
  it("posts the project to the channel as the member, and audits it without the message", async () => {
    await connect(a);
    clickUp.messageUrl = "https://app.clickup.com/9012/chat/r/c-1";
    const response = await send(a, {
      channelId: "c-1",
      note: "  Please check the [hero](https://evil.test).\r\n@everyone  ",
      assignee: "82",
      followers: ["81", "82", "81"],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://app.clickup.com/9012/chat/r/c-1" });
    const posted = clickUpCalls.find(({ method }) => method === "POST");
    expect(posted?.href).toBe(`${CHANNELS}/c-1/messages`);
    expect(posted?.body).toEqual({
      type: "message",
      content: [
        "**[Home \\[page\\] \\*v2\\*](https://squint.test/p/p1)**",
        "Please check the \\[hero\\]\\(https\\:\\/\\/evil\\.test\\)\\.\\\n\\@everyone",
        "_Sent for review from Squint_",
      ].join("\n\n"),
      content_format: "text/md",
      assignee: "82",
      followers: ["81", "82"],
    });
    expect(await sends()).toEqual([
      {
        actor_user_id: a.userId,
        workspace_id: a.workspaceId,
        target_id: "p1",
        meta: {
          fields: ["clickup"],
          clickUpTeamId: TEAM,
          channelId: "c-1",
          assigned: 1,
          followers: 2,
        },
      },
    ]);
    const { rows } = await db.query("SELECT meta::text AS meta FROM audit_log");
    expect(JSON.stringify(rows)).not.toContain("Please check");
  });

  it("sends without a note, an assignee or followers, and without a link when ClickUp gives none", async () => {
    await connect(a);
    const response = await send(a, { channelId: "c-1" });
    expect(await response.json()).toEqual({ url: null });
    expect(clickUpCalls.at(-1)?.body).toEqual({
      type: "message",
      content:
        "**[Home \\[page\\] \\*v2\\*](https://squint.test/p/p1)**\n\n_Sent for review from Squint_",
      content_format: "text/md",
    });
  });

  it("refuses another workspace's project, one in the trash, and an archived one", async () => {
    await connect(a);
    await addProject(b.workspaceId, "theirs", "Theirs");
    expect((await send(a, { channelId: "c-1" }, "theirs")).status).toBe(404);
    expect((await send(a, { channelId: "c-1" }, "nope")).status).toBe(404);
    await db.query("UPDATE projects SET deleted_at = now() WHERE id = 'p1'");
    expect((await send(a, { channelId: "c-1" })).status).toBe(404);
    await db.query("UPDATE projects SET deleted_at = NULL, archived_at = now() WHERE id = 'p1'");
    const archived = await send(a, { channelId: "c-1" });
    expect(archived.status).toBe(409);
    expect(await archived.json()).toEqual({ error: "archived" });
    expect(clickUpCalls).toEqual([]);
    expect(await sends()).toEqual([]);
  });

  it("tells a gone channel, a closed one, a refused token and a busy ClickUp apart, auditing none", async () => {
    await connect(a);
    const gone = await send(a, { channelId: "c-9" });
    expect(gone.status).toBe(409);
    expect(await gone.json()).toEqual({ error: "channel-gone" });

    // A 403 on posting is the channel's (the token still works), not a reason to reconnect.
    clickUp.status = 403;
    const forbidden = await send(a, { channelId: "c-1" });
    expect(forbidden.status).toBe(409);
    expect(await forbidden.json()).toEqual({ error: "channel-forbidden" });

    clickUp.status = 401;
    const refused = await send(a, { channelId: "c-1" });
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({ error: "reconnect" });

    clickUp.status = 429;
    const busy = await send(a, { channelId: "c-1" });
    expect(busy.status).toBe(429);
    expect(busy.headers.get("retry-after")).toBe("60");
    expect(await sends()).toEqual([]);
  });

  it("says when the member isn't connected", async () => {
    const response = await send(a, { channelId: "c-1" });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "not-connected" });
  });

  it("refuses a body it can't send: no channel, a long note, or too many followers", async () => {
    await connect(a);
    for (const [body, field] of [
      [{}, "channelId"],
      [{ channelId: "c 1" }, "channelId"],
      [{ channelId: "c-1", note: "x".repeat(1001) }, "note"],
      [
        { channelId: "c-1", followers: Array.from({ length: 11 }, (_, i) => String(i)) },
        "followers",
      ],
      [{ channelId: "c-1", assignee: "<script>" }, "assignee"],
    ] as const) {
      const response = await send(a, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid", field });
    }
    // A note of 1000 characters, emoji counted as one each, goes.
    expect((await send(a, { channelId: "c-1", note: "👍".repeat(1000) })).status).toBe(200);
  });

  it("stops a member after 20 sends in 10 minutes; another member's are their own", async () => {
    await connect(b);
    await addProject(b.workspaceId, "p2", "P2");
    for (let sent = 0; sent < 20; sent += 1) {
      expect((await send(b, { channelId: "c-1" }, "p2")).status).toBe(200);
    }
    const limited = await send(b, { channelId: "c-1" }, "p2");
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: "rate-limited" });
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await sends()).toHaveLength(20);

    const userId = await insertUser(db, "member@bravo.test");
    await db.query(
      "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'member')",
      [userId, b.workspaceId],
    );
    await connect({ userId, workspaceId: b.workspaceId });
    const cookie = `squint_session=${await createSession(db, userId, Date.now())}`;
    const theirs = await call("POST", `/api/w/${b.workspaceId}/projects/p2/clickup`, {
      cookie,
      body: { channelId: "c-1" },
    });
    expect(theirs.status).toBe(200);
  });
});

describe("a token copied from the workspace connection (040)", () => {
  /** `a`'s 039 connection and 040's copy of it, as the migration leaves them. */
  async function copied() {
    const sealed = sealSecret(TOKEN, legacyClickUpTokenContext(a.workspaceId), TEST_AUTH_SECRET);
    await db.query(
      `INSERT INTO workspace_clickup_connections (workspace_id, clickup_team_id,
         clickup_team_name, clickup_user_id, clickup_username, access_token_sealed, connected_by)
       VALUES ($1, $2, 'Acme Design', '81', 'Ana Ruiz', $3, $4)`,
      [a.workspaceId, TEAM, sealed, a.userId],
    );
    await db.query(
      `INSERT INTO user_clickup_connections (user_id, workspace_id, clickup_team_id,
         clickup_team_name, clickup_user_id, clickup_username, access_token_sealed, sealed_for)
       VALUES ($1, $2, $3, 'Acme Design', '81', 'Ana Ruiz', $4, 'workspace')`,
      [a.userId, a.workspaceId, TEAM, sealed],
    );
    return sealed;
  }

  it("works for its connector, and is sealed to them on first use, the workspace's copy gone", async () => {
    const sealed = await copied();
    expect((await channels(a)).status).toBe(200);
    const { rows } = await db.query<{ access_token_sealed: string; sealed_for: string }>(
      "SELECT access_token_sealed, sealed_for FROM user_clickup_connections",
    );
    expect(rows[0]?.sealed_for).toBe("user");
    expect(rows[0]?.access_token_sealed).not.toBe(sealed);
    const { rows: legacy } = await db.query("SELECT 1 FROM workspace_clickup_connections");
    expect(legacy).toEqual([]);
    expect((await send(a, { channelId: "c-1" })).status).toBe(200);
  });

  it("doesn't open for anyone else, even with the same sealed value", async () => {
    const sealed = await copied();
    const userId = await insertUser(db, "member@acme.test");
    await db.query(
      "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'member')",
      [userId, a.workspaceId],
    );
    await db.query(
      `INSERT INTO user_clickup_connections (user_id, workspace_id, clickup_team_id,
         clickup_team_name, clickup_user_id, clickup_username, access_token_sealed, sealed_for)
       VALUES ($1, $2, $3, 'Acme Design', '81', 'Ana Ruiz', $4, 'workspace')`,
      [userId, a.workspaceId, TEAM, sealed],
    );
    const cookie = `squint_session=${await createSession(db, userId, Date.now())}`;
    const response = await call("GET", `/api/w/${a.workspaceId}/clickup/channels`, { cookie });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "reconnect" });
    expect(clickUpCalls).toEqual([]);
  });
});
