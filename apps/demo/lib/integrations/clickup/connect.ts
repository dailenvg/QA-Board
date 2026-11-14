import { describeError } from "../../auth/http";
import { createRateLimiter, type RateDecision } from "../../capture/rate-limit";
import type { Database } from "../../db/database";
import {
  ClickUpError,
  getClickUpUser,
  listClickUpTeams,
  type ClickUpTeam,
  type Fetch,
} from "./api";
import {
  loadClickUpConnection,
  saveClickUpConnection,
  type ClickUpActor,
  type ClickUpConnection,
} from "./connections";
import type { ClickUpConnectInput } from "./schemas";

/** How a connect went. */
export type ClickUpConnectOutcome =
  | { result: "connected"; connection: ClickUpConnection }
  /** The token reaches several ClickUp workspaces: send it again with one of these. */
  | { result: "choose"; teams: ClickUpTeam[] }
  /** ClickUp doesn't take the token: mistyped, or regenerated since. */
  | { result: "refused" }
  /** The token reaches no ClickUp workspace. */
  | { result: "no-workspace" }
  /** The picked ClickUp workspace isn't one the token reaches (anymore). */
  | { result: "unknown-team"; teams: ClickUpTeam[] }
  /** ClickUp didn't answer, or not as expected. */
  | { result: "unreachable" };

/**
 * Tries per user: each one asks ClickUp twice, so Squint can't be used to
 * check tokens in bulk. Picking among several ClickUp workspaces takes two.
 * Per server instance, like the other in-memory brakes.
 */
const attempts = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 });

/** Counts one connect attempt by `userId`; over the budget, how long until the next. */
export function claimClickUpAttempt(userId: string, now: number): RateDecision {
  return attempts(userId, now);
}

interface Services {
  apiUrl: string;
  fetcher?: Fetch;
  /** `AUTH_SECRET` unless a test passes its own. */
  secret?: string;
}

/**
 * Checks a personal token with ClickUp (whose it is, and the ClickUp
 * workspaces it reaches), then connects the actor, in their workspace: to the
 * token's only ClickUp workspace, or to `teamId` when it reaches several.
 * Without a `teamId` then, nothing is saved: they pick, and send it again.
 * The token never goes back to the browser.
 */
export async function connectClickUp(
  db: Database,
  actor: ClickUpActor,
  { token, teamId }: ClickUpConnectInput,
  now: number,
  { apiUrl, fetcher, secret }: Services,
): Promise<ClickUpConnectOutcome> {
  let checked;
  try {
    const user = await getClickUpUser(apiUrl, token, fetcher);
    checked = { user, teams: await listClickUpTeams(apiUrl, token, fetcher) };
  } catch (error) {
    if (error instanceof ClickUpError && error.refused) return { result: "refused" };
    console.error(`squint clickup: token check failed (${describeError(error)})`);
    return { result: "unreachable" };
  }
  const { user, teams } = checked;
  if (teams.length === 0) return { result: "no-workspace" };
  const team = teamId ? teams.find(({ id }) => id === teamId) : teams.length === 1 && teams[0];
  if (!team) return teamId ? { result: "unknown-team", teams } : { result: "choose", teams };
  await saveClickUpConnection(db, actor, { token, user, team }, now, secret);
  const connection = await loadClickUpConnection(db, actor);
  if (!connection) throw new Error("The ClickUp connection just saved is gone");
  return { result: "connected", connection };
}
