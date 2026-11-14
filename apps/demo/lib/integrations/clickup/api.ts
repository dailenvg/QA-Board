import { z } from "zod";
import { LoggableError } from "../../auth/http";
import { cleanClientName } from "../../share/client-name";

/**
 * Calling ClickUp's API with a personal token, and the v2 calls: whose token
 * it is, the ClickUp workspaces ("teams") it reaches, and their people. A
 * personal token goes in `Authorization` as it is, with no `Bearer`. Tokens
 * and ClickUp's answers are never logged: failures say which call and its status only.
 */

/** `fetch`, or a stand-in for tests. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** The ClickUp user a token belongs to. */
export interface ClickUpUser {
  id: string;
  username: string;
}

/** A ClickUp workspace the token reaches. */
export interface ClickUpTeam {
  id: string;
  name: string;
}

/** Someone in a ClickUp workspace, who can be assigned a message or follow it. */
export interface ClickUpPerson {
  id: string;
  username: string;
  /** Null when ClickUp doesn't give one. */
  email: string | null;
}

/** Each call gives up after this long. */
const TIMEOUT_MS = 10_000;

/** Longest name kept (the columns' limit), in characters. */
const NAME_MAX = 200;

/** A ClickUp call failed: which one and how, never the token or what ClickUp said. */
export class ClickUpError extends LoggableError {
  override name = "ClickUpError";
  /** ClickUp's status; 0 when it didn't answer, or not in a known shape. */
  readonly status: number;
  /**
   * ClickUp refused the token itself (401 or 403): wrong, regenerated, or out of the workspace.
   * Posting tells a 403 apart (a channel the member can't post in: `sendProjectToClickUp`).
   */
  readonly refused: boolean;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
    this.refused = status === 401 || status === 403;
  }
}

export const clickUpId = z
  .union([z.string(), z.number()])
  .transform(String)
  .pipe(z.string().min(1).max(64));

const userAnswer = z.object({
  user: z.object({ id: clickUpId, username: z.string().nullish() }),
});

const member = z.object({
  user: z.object({
    id: clickUpId,
    username: z.string().nullish(),
    email: z.string().nullish(),
  }),
});

const teamsAnswer = z.object({
  teams: z.array(
    z.object({
      id: clickUpId,
      name: z.string().nullish(),
      members: z.array(z.unknown()).nullish(),
    }),
  ),
});

/**
 * A name as shown in Squint: on one line and with nothing hidden
 * (`cleanClientName`'s rules), at most `NAME_MAX` characters; `fallback` when none is left.
 */
export function shownName(name: string | null | undefined, fallback: string): string {
  const line = cleanClientName(name) || fallback;
  return Array.from(line).slice(0, NAME_MAX).join("").trim();
}

/**
 * One call to ClickUp: `path` after the API's URL, a JSON `body` for a POST.
 * Answers the parsed JSON (null when it isn't any); throws a `ClickUpError`
 * that names the call when ClickUp can't be reached or doesn't answer 2xx.
 */
export async function requestClickUp(
  apiUrl: string,
  token: string,
  call: { method?: "GET" | "POST"; path: string; body?: unknown },
  fetcher: Fetch,
): Promise<unknown> {
  const { method = "GET", path, body } = call;
  const what = `${method} ${path.replace(/\?.*$/, "")}`;
  let response: Response;
  try {
    response = await fetcher(`${apiUrl}${path}`, {
      method,
      headers: {
        authorization: token,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const kind = error instanceof Error ? error.name : typeof error;
    throw new ClickUpError(`${what} unreachable (${kind})`);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new ClickUpError(`${what} answered ${response.status}`, response.status);
  }
  return response.json().catch(() => null);
}

/** Whose token it is; throws a `refused` `ClickUpError` when ClickUp won't take it. */
export async function getClickUpUser(
  apiUrl: string,
  token: string,
  fetcher: Fetch = fetch,
): Promise<ClickUpUser> {
  const answer = await requestClickUp(apiUrl, token, { path: "/v2/user" }, fetcher);
  const parsed = userAnswer.safeParse(answer);
  if (!parsed.success) throw new ClickUpError("GET /v2/user answered in an unknown shape");
  const { user } = parsed.data;
  return { id: user.id, username: shownName(user.username, `ClickUp user ${user.id}`) };
}

async function getTeams(apiUrl: string, token: string, fetcher: Fetch) {
  const parsed = teamsAnswer.safeParse(
    await requestClickUp(apiUrl, token, { path: "/v2/team" }, fetcher),
  );
  if (!parsed.success) throw new ClickUpError("GET /v2/team answered in an unknown shape");
  return parsed.data.teams;
}

/** The ClickUp workspaces the token reaches, in ClickUp's order. */
export async function listClickUpTeams(
  apiUrl: string,
  token: string,
  fetcher: Fetch = fetch,
): Promise<ClickUpTeam[]> {
  const teams = await getTeams(apiUrl, token, fetcher);
  return teams.map((team) => ({
    id: team.id,
    name: shownName(team.name, `ClickUp workspace ${team.id}`),
  }));
}

/**
 * The people in the ClickUp workspace `teamId`, by name. An entry ClickUp
 * sends in another shape is left out rather than failing the list; a token
 * that no longer reaches the workspace is refused.
 */
export async function listClickUpPeople(
  apiUrl: string,
  token: string,
  teamId: string,
  fetcher: Fetch = fetch,
): Promise<ClickUpPerson[]> {
  const team = (await getTeams(apiUrl, token, fetcher)).find(({ id }) => id === teamId);
  if (!team) throw new ClickUpError("GET /v2/team left out the connected workspace", 403);
  const people = new Map<string, ClickUpPerson>();
  for (const entry of team.members ?? []) {
    const parsed = member.safeParse(entry);
    if (!parsed.success) continue;
    const { id, username, email } = parsed.data.user;
    const address = shownName(email, "") || null;
    people.set(id, {
      id,
      username: shownName(username, address ?? `ClickUp user ${id}`),
      email: address,
    });
  }
  return [...people.values()].sort((a, b) =>
    a.username.localeCompare(b.username, undefined, { sensitivity: "base" }),
  );
}
