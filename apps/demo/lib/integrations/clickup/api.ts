import { z } from "zod";
import { LoggableError } from "../../auth/http";
import { cleanClientName } from "../../share/client-name";

/**
 * The ClickUp API calls connecting needs: whose personal token it is, and
 * which ClickUp workspaces ("teams") it reaches. A personal token goes in
 * `Authorization` as it is, with no `Bearer`. Tokens are never logged:
 * failures say which call and its status only.
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

/** Each call gives up after this long. */
const TIMEOUT_MS = 10_000;

/** Longest name kept (the columns' limit), in characters. */
const NAME_MAX = 200;

/** A ClickUp call failed: which one and how, never the token. */
export class ClickUpError extends LoggableError {
  override name = "ClickUpError";
  /** ClickUp refused the token itself (401): wrong, or regenerated since. */
  readonly refused: boolean;
  constructor(message: string, refused = false) {
    super(message);
    this.refused = refused;
  }
}

const id = z.union([z.string(), z.number()]).transform(String).pipe(z.string().min(1).max(64));

const userAnswer = z.object({
  user: z.object({ id, username: z.string().nullish() }),
});

const teamsAnswer = z.object({
  teams: z.array(z.object({ id, name: z.string().nullish() })),
});

/**
 * A name as shown in Squint: on one line and with nothing hidden
 * (`cleanClientName`'s rules), at most `NAME_MAX` characters; `fallback` when none is left.
 */
function shownName(name: string | null | undefined, fallback: string): string {
  const line = cleanClientName(name) || fallback;
  return Array.from(line).slice(0, NAME_MAX).join("").trim();
}

async function get(apiUrl: string, path: string, token: string, fetcher: Fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(`${apiUrl}${path}`, {
      headers: { authorization: token, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const kind = error instanceof Error ? error.name : typeof error;
    throw new ClickUpError(`GET ${path} unreachable (${kind})`);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new ClickUpError(`GET ${path} answered ${response.status}`, response.status === 401);
  }
  return response.json().catch(() => null);
}

/** Whose token it is; throws a `refused` `ClickUpError` when ClickUp won't take it. */
export async function getClickUpUser(
  apiUrl: string,
  token: string,
  fetcher: Fetch = fetch,
): Promise<ClickUpUser> {
  const parsed = userAnswer.safeParse(await get(apiUrl, "/user", token, fetcher));
  if (!parsed.success) throw new ClickUpError("GET /user answered in an unknown shape");
  const { user } = parsed.data;
  return { id: user.id, username: shownName(user.username, `ClickUp user ${user.id}`) };
}

/** The ClickUp workspaces the token reaches, in ClickUp's order. */
export async function listClickUpTeams(
  apiUrl: string,
  token: string,
  fetcher: Fetch = fetch,
): Promise<ClickUpTeam[]> {
  const parsed = teamsAnswer.safeParse(await get(apiUrl, "/team", token, fetcher));
  if (!parsed.success) throw new ClickUpError("GET /team answered in an unknown shape");
  return parsed.data.teams.map((team) => ({
    id: team.id,
    name: shownName(team.name, `ClickUp workspace ${team.id}`),
  }));
}
