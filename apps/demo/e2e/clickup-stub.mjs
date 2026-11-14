// A stand-in for ClickUp's API, for the e2e suite only: Playwright starts it (playwright.config.ts)
// and points the e2e server at it with CLICKUP_API_URL, which the app takes only as plain http on
// this machine and never on production (lib/integrations/clickup/config.ts). It knows two fake
// personal tokens (e2e/clickup-tokens.json): one reaching one ClickUp workspace, one reaching
// two. Every other token gets ClickUp's 401. No real token ever reaches it.
//
// Chat (v3): the first workspace's channels, two to a page so the app has to follow the cursor,
// and posting a message, which it records. Test-only routes under /__test/ let a spec read what
// was posted, refuse a token from now on (as if it were regenerated), delete a channel (gone from
// the list, a 404 on posting), close one to the member (a 403 on posting), fail the next channel
// list reads (a 500), and start over.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const PORT = 3101;
const { ONE_WORKSPACE, TWO_WORKSPACES, USER, TEAMS, MEMBERS, CHANNELS } = JSON.parse(
  readFileSync(new URL("./clickup-tokens.json", import.meta.url), "utf8"),
);

/** The ClickUp workspaces each known token reaches. */
const TOKENS = new Map([
  [ONE_WORKSPACE, TEAMS.slice(0, 1)],
  [TWO_WORKSPACES, TEAMS],
]);

/** Channels per page, whatever `limit` asks: small, so paging is exercised. */
const PAGE_SIZE = 2;

/** Messages posted since the last reset, with the channel they went to. */
let messages = [];
/** Tokens refused since the last reset. */
let revoked = new Set();
/** Channels deleted since the last reset. */
let removed = new Set();
/** Channels the member can't post in since the last reset. */
let forbidden = new Set();
/** How many channel list reads still fail. */
let failingLists = 0;

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  let text = "";
  for await (const chunk of request) text += chunk;
  try {
    return JSON.parse(text || "null");
  } catch {
    return null;
  }
}

/** The test-only routes; true when it answered. */
async function testRoute(request, response, path) {
  if (path === "/__test/messages") send(response, 200, { messages });
  else if (path === "/__test/reset") {
    messages = [];
    revoked = new Set();
    removed = new Set();
    forbidden = new Set();
    failingLists = 0;
    send(response, 200, { ok: true });
  } else if (path === "/__test/revoke") {
    const { token } = (await readBody(request)) ?? {};
    revoked.add(token);
    send(response, 200, { ok: true });
  } else if (path === "/__test/remove-channel") {
    const { id } = (await readBody(request)) ?? {};
    removed.add(id);
    send(response, 200, { ok: true });
  } else if (path === "/__test/forbid-channel") {
    const { id } = (await readBody(request)) ?? {};
    forbidden.add(id);
    send(response, 200, { ok: true });
  } else if (path === "/__test/fail-lists") {
    const { count } = (await readBody(request)) ?? {};
    failingLists = Number(count) || 0;
    send(response, 200, { ok: true });
  } else return false;
  return true;
}

function channelsPage(url) {
  const channels = CHANNELS.filter((channel) => !removed.has(channel.id));
  const start = Number(url.searchParams.get("cursor") ?? 0);
  const data = channels.slice(start, start + PAGE_SIZE);
  const next = start + PAGE_SIZE < channels.length ? String(start + PAGE_SIZE) : null;
  return { data, next_cursor: next };
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  if (path === "/health") return send(response, 200, { ok: true });
  if (path.startsWith("/__test/") && (await testRoute(request, response, path))) return;
  const token = request.headers.authorization ?? "";
  const teams = revoked.has(token) ? undefined : TOKENS.get(token);
  if (!teams) return send(response, 401, { err: "Token invalid", ECODE: "OAUTH_025" });
  if (request.method === "GET" && path === "/api/v2/user") {
    return send(response, 200, { user: USER });
  }
  if (request.method === "GET" && path === "/api/v2/team") {
    const members = MEMBERS.map((user) => ({ user: { ...user, profilePicture: null } }));
    return send(response, 200, { teams: teams.map((team) => ({ ...team, members })) });
  }
  const chat = path.match(
    /^\/api\/v3\/workspaces\/([^/]+)\/chat\/channels(?:\/([^/]+)\/messages)?$/,
  );
  if (!chat || !teams.some((team) => team.id === chat[1])) {
    return send(response, 404, { err: "Route not found" });
  }
  const channelId = chat[2] ? decodeURIComponent(chat[2]) : null;
  if (request.method === "GET" && !channelId) {
    if (failingLists > 0) {
      failingLists -= 1;
      return send(response, 500, { err: "Internal error" });
    }
    return send(response, 200, channelsPage(url));
  }
  if (request.method === "POST" && channelId) {
    const open = (channel) => channel.id === channelId && !channel.archived;
    if (removed.has(channelId) || !CHANNELS.some(open)) {
      return send(response, 404, { err: "Channel not found" });
    }
    if (forbidden.has(channelId)) {
      return send(response, 403, { err: "Not allowed to post", ECODE: "CHAT_403" });
    }
    const body = await readBody(request);
    messages.push({ channelId, body });
    return send(response, 201, {
      id: `m-${messages.length}`,
      url: `https://app.clickup.com/${chat[1]}/chat/r/${channelId}`,
    });
  }
  return send(response, 404, { err: "Route not found" });
}).listen(PORT, "127.0.0.1");
