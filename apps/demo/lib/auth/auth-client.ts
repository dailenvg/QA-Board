/**
 * The browser side of the auth routes: posts, and what each answer means for
 * the forms. Never throws: a network failure is an outcome too.
 */

import { safeNextPath, type Welcome } from "./next-path";

export type LoginError =
  | "invalid-credentials"
  /** The right password, on an account removed from its workspace (decision 20). */
  | "removed"
  | "rate-limited"
  | "not-configured"
  | "failed";

export type LoginOutcome =
  | { ok: true; welcome: Welcome; home: string }
  | { ok: false; error: LoginError; retryAfterSeconds?: number };

export type ResetOutcome = { ok: true } | { ok: false; error: "expired" | "failed" };

/** The words of the wrong-credentials message that link to the password reset. */
export const RESET_LINK = { text: "reset your password", href: "/reset" } as const;

/** The lock's length, when a 429 somehow arrives without Retry-After. */
const DEFAULT_RETRY_SECONDS = 15 * 60;

async function post(path: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

/** The `error` code of a JSON answer, or null. */
async function errorCode(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error
    : null;
}

/** The greeting a sign-in earned; a return when the answer doesn't say. */
/**
 * The greeting a sign-in gets (a return, unless it says first) and the
 * account's home (the Overview, unless it names another page on this site).
 */
async function readSignedIn(response: Response): Promise<{ welcome: Welcome; home: string }> {
  const body: unknown = await response.json().catch(() => null);
  const fields = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return {
    welcome: fields.welcome === "first" ? "first" : "back",
    home: safeNextPath(typeof fields.home === "string" ? fields.home : null),
  };
}

export async function requestLogin(email: string, password: string): Promise<LoginOutcome> {
  const response = await post("/api/auth/login", { email, password });
  if (response?.ok) return { ok: true, ...(await readSignedIn(response)) };
  switch (response?.status) {
    case 400:
    case 401:
      return { ok: false, error: "invalid-credentials" };
    case 403:
      return (await errorCode(response)) === "removed"
        ? { ok: false, error: "removed" }
        : { ok: false, error: "failed" };
    case 429:
      return {
        ok: false,
        error: "rate-limited",
        retryAfterSeconds: Number(response.headers.get("retry-after")) || DEFAULT_RETRY_SECONDS,
      };
    case 503:
      return { ok: false, error: "not-configured" };
    default:
      return { ok: false, error: "failed" };
  }
}

/** What the sign-in form says for a failed attempt. */
export function loginErrorMessage(error: LoginError, retryAfterSeconds = 0): string {
  switch (error) {
    case "invalid-credentials":
      // Generic on purpose: never says which of the two was wrong.
      return `Invalid email or password. Check both and try again, or ${RESET_LINK.text}.`;
    case "removed":
      // No workspace name, no date, and never RESET_LINK's words: reset sends a removed account nothing.
      return "You're no longer in a Squint workspace, so you can't sign in. Ask the person who invited you for a new invite.";
    case "rate-limited": {
      const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
      return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
    }
    case "not-configured":
      return "Sign-in isn't set up on this server yet.";
    case "failed":
      return "Couldn't reach Squint. Check your connection and try again.";
  }
}

/** True once the server has the request; it answers the same whether or not the account exists. */
export async function requestResetEmail(email: string): Promise<boolean> {
  const response = await post("/api/auth/reset", { email });
  return response?.ok ?? false;
}

export async function setNewPassword(token: string, password: string): Promise<ResetOutcome> {
  const response = await post("/api/auth/reset/complete", { token, password });
  if (response?.ok) return { ok: true };
  return { ok: false, error: response?.status === 410 ? "expired" : "failed" };
}
