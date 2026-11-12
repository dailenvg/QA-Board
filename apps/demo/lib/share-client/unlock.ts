import { SHARE_LIMITS } from "../share/limits";
import type { ClientView } from "../share/types";
import { clientApi, type ApiResult } from "./api";

/**
 * A guest unlocking a password-protected review link, in the browser: the
 * post, what each answer means, and what the password screen says about it.
 * The password is only ever in the request's body: never kept, logged or put
 * in an address.
 */

/** The password limit's window, for a 429 that somehow says nothing of when to try again. */
const DEFAULT_RETRY_SECONDS = 15 * 60;

export type UnlockFailure =
  /** 401 `wrong-password`: counted against the limit. */
  | { ok: false; reason: "wrong-password" }
  /** 429: no more tries from this address for `retryAfterSeconds`, even with the right password. */
  | { ok: false; reason: "rate-limited"; retryAfterSeconds: number }
  /** 400: refused before it was checked (empty, or longer than any link's password). */
  | { ok: false; reason: "invalid" }
  /** 404: the link was revoked, expired or never existed. */
  | { ok: false; reason: "gone" }
  /** Unlocked, but the review still asks for the pass: this browser didn't keep its cookie. */
  | { ok: false; reason: "no-pass" }
  /** No answer, a server error, or a refusal the form can't help with. */
  | { ok: false; reason: "failed" };

export type UnlockOutcome = { ok: true; view: ClientView } | UnlockFailure;

/** A guest route's answer that the link now needs its password: the guest pass is missing or void. */
export function isPasswordRequired(result: ApiResult<unknown>): boolean {
  return !result.ok && result.status === 401 && result.error === "password-required";
}

function bodyRetrySeconds(body: unknown): number | null {
  if (typeof body !== "object" || body === null || !("retryAfterSeconds" in body)) return null;
  const seconds = Number(body.retryAfterSeconds);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/**
 * How long a 429 asks to wait, in whole seconds: `Retry-After` (seconds, or
 * an HTTP date), else the body's `retryAfterSeconds`, else the limit's window.
 */
export function retryAfterSeconds(header: string | null, body: unknown, now: number): number {
  const value = header?.trim() ?? "";
  if (/^\d+$/.test(value)) return Math.max(1, Number(value));
  const date = value ? Date.parse(value) : Number.NaN;
  if (Number.isFinite(date)) return Math.max(1, Math.ceil((date - now) / 1000));
  return Math.ceil(bodyRetrySeconds(body) ?? DEFAULT_RETRY_SECONDS);
}

/** The review, read with the pass the unlock just set. */
async function openView(token: string): Promise<UnlockOutcome> {
  const view = await clientApi(token).view();
  if (view.ok) return { ok: true, view: view.value };
  if (view.status === 404) return { ok: false, reason: "gone" };
  if (isPasswordRequired(view)) return { ok: false, reason: "no-pass" };
  return { ok: false, reason: "failed" };
}

function failureOf(response: Response, body: unknown): UnlockFailure {
  switch (response.status) {
    case 401:
      return { ok: false, reason: "wrong-password" };
    case 429: {
      const seconds = retryAfterSeconds(response.headers.get("retry-after"), body, Date.now());
      return { ok: false, reason: "rate-limited", retryAfterSeconds: seconds };
    }
    case 400:
    case 413:
      return { ok: false, reason: "invalid" };
    case 404:
      return { ok: false, reason: "gone" };
    default:
      return { ok: false, reason: "failed" };
  }
}

/**
 * Tries `password` on the link and, when it's right, reads the review with
 * the guest pass that came back. Must be a `fetch()`: the page sends no
 * referrer, so a plain form post would carry `Origin: null` and be refused.
 * Never throws.
 */
export async function unlockLink(token: string, password: string): Promise<UnlockOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/s/${encodeURIComponent(token)}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, reason: "failed" };
  }
  const body: unknown = await response.json().catch(() => null);
  return response.ok ? openView(token) : failureOf(response, body);
}

/** The password field's own check, before anything is sent. */
export function unlockPasswordError(value: string): string | null {
  if (!value) return "Enter the password.";
  if (value.length > SHARE_LIMITS.password.max) {
    return `This link's password is at most ${SHARE_LIMITS.password.max} characters.`;
  }
  return null;
}

/** What the 429 says while it lasts: the wait in whole minutes, rounded up. */
export function retryMessage(secondsLeft: number): string {
  const minutes = Math.max(1, Math.ceil(secondsLeft / 60));
  return `Too many tries. You can try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

/** Seconds left until `retryAt` (epoch ms), in whole seconds; 0 once it has passed or without one. */
export function secondsUntil(retryAt: number | null, now: number): number {
  return retryAt === null ? 0 : Math.max(0, Math.ceil((retryAt - now) / 1000));
}

export interface UnlockFeedback {
  /** Under the field, with it: a wrong or refused password. */
  fieldError: string | null;
  /** Above the button: what the field can't fix (no connection, no cookie). */
  formError: string | null;
  /** Until when submitting stays off (epoch ms), after a 429. */
  retryAt: number | null;
  /** Empty the field and put the cursor back in it. */
  clearField: boolean;
}

const NO_FEEDBACK: UnlockFeedback = {
  fieldError: null,
  formError: null,
  retryAt: null,
  clearField: false,
};

/** Words for the failures the password screen shows (a gone link replaces the screen instead). */
export const UNLOCK_MESSAGES = {
  wrongPassword:
    "That password isn't right. Check it with whoever shared the link, then try again.",
  invalid: `Enter the password, up to ${SHARE_LIMITS.password.max} characters.`,
  noPass:
    "Your browser didn't keep the pass this link needs. Allow cookies for this site, then try again.",
  failed: "Couldn't reach Squint. Check your connection and try again.",
} as const;

/** What the password screen shows after a failed try, at `now` (epoch ms). */
export function unlockFeedback(failure: UnlockFailure, now: number): UnlockFeedback {
  switch (failure.reason) {
    case "wrong-password":
      return { ...NO_FEEDBACK, fieldError: UNLOCK_MESSAGES.wrongPassword, clearField: true };
    case "rate-limited":
      return { ...NO_FEEDBACK, retryAt: now + failure.retryAfterSeconds * 1000 };
    case "invalid":
      return { ...NO_FEEDBACK, fieldError: UNLOCK_MESSAGES.invalid };
    case "no-pass":
      return { ...NO_FEEDBACK, formError: UNLOCK_MESSAGES.noPass };
    case "gone":
    case "failed":
      return { ...NO_FEEDBACK, formError: UNLOCK_MESSAGES.failed };
  }
}
