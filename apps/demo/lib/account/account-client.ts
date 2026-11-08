/**
 * The browser side of the account routes: requests, and what each answer
 * means for the settings forms. Never throws: a network failure is an outcome too.
 */

import { loginErrorMessage } from "../auth/auth-client";

export type AccountError =
  | "wrong-password"
  | "same-email"
  | "rate-limited"
  | "too-many-requests"
  | "invalid"
  | "signed-out"
  | "failed";

export type AccountOutcome =
  { ok: true } | { ok: false; error: AccountError; retryAfterSeconds?: number };

export type ConfirmOutcome = { ok: true } | { ok: false; error: "expired" | "taken" | "failed" };

/** The lock's length, when a 429 somehow arrives without Retry-After. */
const DEFAULT_RETRY_SECONDS = 15 * 60;

async function send(method: "POST" | "PATCH" | "DELETE", path: string, body: unknown) {
  try {
    return await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

async function errorCode(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error
    : null;
}

async function outcomeOf(response: Response | null): Promise<AccountOutcome> {
  if (response?.ok) return { ok: true };
  switch (response?.status) {
    case 400:
      return { ok: false, error: "invalid" };
    case 401:
      return { ok: false, error: "signed-out" };
    case 422:
      return (await errorCode(response)) === "same-email"
        ? { ok: false, error: "same-email" }
        : { ok: false, error: "wrong-password" };
    case 429:
      if ((await errorCode(response)) === "too-many-requests") {
        return { ok: false, error: "too-many-requests" };
      }
      return {
        ok: false,
        error: "rate-limited",
        retryAfterSeconds: Number(response.headers.get("retry-after")) || DEFAULT_RETRY_SECONDS,
      };
    default:
      return { ok: false, error: "failed" };
  }
}

export async function saveDisplayName(name: string): Promise<AccountOutcome> {
  return outcomeOf(await send("PATCH", "/api/account/profile", { name }));
}

/** On success this browser has a new session cookie; every other one is signed out. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AccountOutcome> {
  return outcomeOf(await send("POST", "/api/account/password", { currentPassword, newPassword }));
}

/** Succeeds the same whether or not another account has `newEmail`. */
export async function requestEmailChange(
  currentPassword: string,
  newEmail: string,
): Promise<AccountOutcome> {
  return outcomeOf(await send("POST", "/api/account/email", { currentPassword, newEmail }));
}

/** Ends every session of the account, this browser's included. */
export async function logOutEverywhere(): Promise<AccountOutcome> {
  return outcomeOf(await send("DELETE", "/api/account/sessions", {}));
}

export async function confirmEmailChange(token: string): Promise<ConfirmOutcome> {
  const response = await send("POST", "/api/auth/email-change/confirm", { token });
  if (response?.ok) return { ok: true };
  if (response?.status === 410) return { ok: false, error: "expired" };
  if (response?.status === 409) return { ok: false, error: "taken" };
  return { ok: false, error: "failed" };
}

/** What a settings form says for a failed request. */
export function accountErrorMessage(error: AccountError, retryAfterSeconds = 0): string {
  switch (error) {
    case "wrong-password":
      return "That isn't your current password. Check it and try again.";
    case "same-email":
      return "That's already your email address.";
    case "rate-limited":
      return loginErrorMessage("rate-limited", retryAfterSeconds);
    case "too-many-requests":
      return "You've asked for 3 email changes in the last hour. Try again later.";
    case "invalid":
      return "Check the fields above and try again.";
    case "signed-out":
      return "You've been signed out. Sign in again to make changes.";
    case "failed":
      return "Couldn't reach Squint. Check your connection and try again.";
  }
}
