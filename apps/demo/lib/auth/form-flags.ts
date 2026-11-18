import type { AcceptRefusal } from "../workspace/members/accept";
import type { LoginError } from "./auth-client";
import { loginErrorMessage } from "./auth-client";
import { ACCOUNT_DELETION_GRACE_DAYS } from "../account/field-rules";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./field-rules";

/**
 * Flags the auth routes put in the address when they answer a plain form post
 * (one sent before the page hydrated) with a redirect back to its page, and
 * the messages those pages show for them. Codes only: never an email, a
 * password or anything else the person typed. Client-safe.
 */

export const LOGIN_ERRORS: readonly LoginError[] = [
  "invalid-credentials",
  "removed",
  "suspended",
  "rate-limited",
  "not-configured",
  "failed",
];

export type ResetRequestFlag = "invalid-email" | "rate-limited" | "unavailable";
export type ResetPasswordFlag = "weak" | "mismatch" | "unavailable";
export type EmailChangeFlag = "taken" | "unavailable";
/** Why a join form post went back to the invite's page: a refusal, a field, or no answer. */
export type JoinFlag = AcceptRefusal | "invalid" | "mismatch" | "rate-limited" | "unavailable";

const RESET_REQUEST_MESSAGES: Record<ResetRequestFlag, string> = {
  "invalid-email": "Enter an email address like name@company.com.",
  "rate-limited": "Too many requests. Wait a minute and try again.",
  unavailable: "Couldn't send the request. Try again in a moment.",
};

const RESET_PASSWORD_MESSAGES: Record<ResetPasswordFlag, string> = {
  weak: `Use a new password of ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`,
  mismatch: "The two passwords didn't match. Type them again.",
  unavailable: "Couldn't save the new password. Try again in a moment.",
};

const EMAIL_CHANGE_MESSAGES: Record<EmailChangeFlag, string> = {
  taken: "Another account uses this email address now, so the change can't be made.",
  unavailable: "Couldn't confirm the change. Try again in a moment.",
};

/**
 * The join page reads the invite's state again on its way back, so a refusal
 * usually shows as its own panel; these say it where the form shows again.
 * No names: a code is all the address carries.
 */
const JOIN_MESSAGES: Record<JoinFlag, string> = {
  invalid: `Enter your name and a password of ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`,
  mismatch: "The two passwords didn't match. Type them again.",
  "rate-limited": "Too many attempts. Wait a minute and try again.",
  unavailable: "Couldn't join just now. Try again in a moment.",
  "not-found":
    "This invite link doesn't work. Check that you copied all of it, or ask for a new one.",
  expired: "This invite has expired. Ask the workspace's owner for a new one.",
  cancelled: "This invite was cancelled. Ask the workspace's owner for a new one.",
  used: "This invite has been used. If that wasn't you, ask the workspace's owner for a new one.",
  "seats-full":
    "This workspace is full right now. Ask the workspace's owner to free a seat, then try again.",
  "wrong-account": "This invite is for someone else.",
  "cannot-join": "This invite is for someone else.",
  "in-another-workspace":
    "You're already in another workspace. For now, each person can be in only one.",
  "sign-in-first": "This email already has a Squint account. Sign in to join.",
  "account-closing": "This email can't join right now.",
};

function known<T extends string>(messages: Record<T, string>, code: string | undefined) {
  return code !== undefined && Object.hasOwn(messages, code) ? messages[code as T] : null;
}

/** The sign-in page's message for `?error=` (and `?retry=` seconds), or null for none or unknown. */
export function loginFlagMessage(error: string | undefined, retry?: string): string | null {
  const code = LOGIN_ERRORS.find((entry) => entry === error);
  return code ? loginErrorMessage(code, Number(retry) || 0) : null;
}

export function resetRequestFlagMessage(error: string | undefined): string | null {
  return known(RESET_REQUEST_MESSAGES, error);
}

export function resetPasswordFlagMessage(error: string | undefined): string | null {
  return known(RESET_PASSWORD_MESSAGES, error);
}

export function emailChangeFlagMessage(error: string | undefined): string | null {
  return known(EMAIL_CHANGE_MESSAGES, error);
}

/** The join page's message for `?error=`, or null for none or unknown. */
export function joinFlagMessage(error: string | undefined): string | null {
  return known(JOIN_MESSAGES, error);
}

/**
 * What the sign-in page says on arrival, from `?reset=done`, `?email=changed`,
 * `?signed-out=everywhere` or `?account=deleted`.
 */
export function loginNotice(params: {
  reset?: string;
  email?: string;
  signedOut?: string;
  account?: string;
}): string | null {
  if (params.reset === "done") return "Password changed. Sign in with your new password.";
  if (params.email === "changed") return "Email changed. Sign in with your new email address.";
  if (params.signedOut === "everywhere") return "You're signed out on every device.";
  if (params.account === "deleted") {
    return `Your account is scheduled for deletion, and you're signed out on every device. Your Squint admin can restore it within ${ACCOUNT_DELETION_GRACE_DAYS} days.`;
  }
  return null;
}
