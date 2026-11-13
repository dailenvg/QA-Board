// A stand-in for ClickUp's API, for the e2e suite only: Playwright starts it (playwright.config.ts)
// and points the e2e server at it with CLICKUP_API_URL, which the app takes only as plain http on
// this machine and never on production (lib/integrations/clickup/config.ts). It knows two fake
// personal tokens (e2e/clickup-tokens.json): one reaching one ClickUp workspace, one reaching
// two. Every other token gets ClickUp's 401. No real token ever reaches it.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const PORT = 3101;
const { ONE_WORKSPACE, TWO_WORKSPACES, USER, TEAMS } = JSON.parse(
  readFileSync(new URL("./clickup-tokens.json", import.meta.url), "utf8"),
);

/** The ClickUp workspaces each known token reaches. */
const TOKENS = new Map([
  [ONE_WORKSPACE, TEAMS.slice(0, 1)],
  [TWO_WORKSPACES, TEAMS],
]);

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer((request, response) => {
  if (request.url === "/health") return send(response, 200, { ok: true });
  const teams = TOKENS.get(request.headers.authorization ?? "");
  if (!teams) return send(response, 401, { err: "Token invalid", ECODE: "OAUTH_025" });
  if (request.method === "GET" && request.url === "/api/v2/user") {
    return send(response, 200, { user: USER });
  }
  if (request.method === "GET" && request.url === "/api/v2/team") {
    return send(response, 200, { teams });
  }
  return send(response, 404, { err: "Route not found" });
}).listen(PORT, "127.0.0.1");
