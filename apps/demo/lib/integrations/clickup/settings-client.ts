/**
 * The browser side of the ClickUp card in the profile settings. Never
 * throws: a network failure is an outcome too.
 */

import type { ClickUpTeam } from "./api";
import type { ClickUpConnection } from "./connections";

export type ClickUpRequestError =
  /** ClickUp doesn't take the token (or it isn't `pk_…`). */
  | "refused"
  | "no-workspace"
  /** The picked ClickUp workspace isn't one the token reaches anymore. */
  | "unknown-team"
  /** ClickUp didn't answer. */
  | "unreachable"
  /** This site can't reach ClickUp. */
  | "unavailable"
  | "rate-limited"
  | "signed-out"
  | "offline"
  | "failed";

export type ClickUpConnectOutcome =
  | { ok: true; connection: ClickUpConnection }
  | { ok: "choose"; teams: ClickUpTeam[] }
  | { ok: false; error: ClickUpRequestError; teams?: ClickUpTeam[]; retryAfterSeconds?: number };

const PATH = "/api/account/integrations/clickup";

/** A 429 that somehow came without Retry-After: the budget's window. */
const DEFAULT_RETRY_SECONDS = 10 * 60;

async function send(method: "POST" | "DELETE", body: unknown): Promise<Response | null> {
  try {
    return await fetch(PATH, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

/** The answer's body as an object, or an empty one. */
async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

/** A 400 is the token's shape (said as refused) or anything else in the body (a generic failure). */
function errorOf(status: number, code: unknown, field: unknown = null): ClickUpRequestError {
  if (status === 400) return field === "token" ? "refused" : "failed";
  if (status === 401) return "signed-out";
  if (status === 503) return "unavailable";
  if (status === 502) return "unreachable";
  const known = ["refused", "no-workspace", "unknown-team"];
  return typeof code === "string" && known.includes(code)
    ? (code as ClickUpRequestError)
    : "failed";
}

/**
 * Connects with a personal token; with `teamId`, to that ClickUp workspace.
 * When the token reaches several and none was picked: `ok: "choose"`.
 */
export async function connectClickUpToken(
  token: string,
  teamId?: string,
): Promise<ClickUpConnectOutcome> {
  const response = await send("POST", { token, teamId });
  if (!response) return { ok: false, error: "offline" };
  if (response.status === 429) {
    const retry = Number(response.headers.get("retry-after")) || DEFAULT_RETRY_SECONDS;
    return { ok: false, error: "rate-limited", retryAfterSeconds: retry };
  }
  const body = await bodyOf(response);
  if (response.ok && Array.isArray(body.choose)) {
    return { ok: "choose", teams: body.choose as ClickUpTeam[] };
  }
  if (response.ok && body.connection) {
    return { ok: true, connection: body.connection as ClickUpConnection };
  }
  const teams = Array.isArray(body.teams) ? (body.teams as ClickUpTeam[]) : undefined;
  return { ok: false, error: errorOf(response.status, body.error, body.field), teams };
}

export async function disconnectClickUp(): Promise<
  { ok: true } | { ok: false; error: ClickUpRequestError }
> {
  const response = await send("DELETE", {});
  if (!response) return { ok: false, error: "offline" };
  return response.ok ? { ok: true } : { ok: false, error: errorOf(response.status, null) };
}
