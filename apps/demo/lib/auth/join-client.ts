/**
 * The browser side of `POST /api/auth/join`: accepting an invite from its
 * page, and what each answer means there. Never throws: a network failure is
 * an outcome too.
 */

import type { AcceptRefusal } from "../workspace/members/accept";

export type JoinError =
  | AcceptRefusal
  /** The name or password broke the rules the form checks too. */
  | "invalid"
  | "rate-limited"
  /** The request never reached Squint. */
  | "offline"
  /** Squint answered, but with an error of its own. */
  | "failed";

export type JoinOutcome =
  { ok: true } | { ok: false; error: JoinError; retryAfterSeconds?: number };

/** A new person's name and password; left out when the browser is signed in. */
export interface JoinAccount {
  name: string;
  password: string;
}

/** The lock's length, when a 429 somehow arrives without Retry-After. */
const DEFAULT_RETRY_SECONDS = 60;

const REFUSALS: ReadonlySet<string> = new Set<AcceptRefusal>([
  "not-found",
  "expired",
  "cancelled",
  "used",
  "seats-full",
  "wrong-account",
  "cannot-join",
  "in-another-workspace",
  "sign-in-first",
  "account-closing",
]);

async function errorOf(response: Response): Promise<JoinError> {
  if (response.status === 400) return "invalid";
  const body: unknown = await response.json().catch(() => null);
  const code = body && typeof body === "object" && "error" in body ? body.error : null;
  return typeof code === "string" && REFUSALS.has(code) ? (code as AcceptRefusal) : "failed";
}

/** Accepts the invite behind `token`: as the signed-in account, or as a new person with `account`. */
export async function requestJoin(token: string, account?: JoinAccount): Promise<JoinOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/auth/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, ...account }),
    });
  } catch {
    return { ok: false, error: "offline" };
  }
  if (response.ok) return { ok: true };
  if (response.status === 429) {
    return {
      ok: false,
      error: "rate-limited",
      retryAfterSeconds: Number(response.headers.get("retry-after")) || DEFAULT_RETRY_SECONDS,
    };
  }
  return { ok: false, error: await errorOf(response) };
}
