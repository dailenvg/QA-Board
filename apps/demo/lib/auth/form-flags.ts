import type { LoginError } from "./auth-client";
import { loginErrorMessage } from "./auth-client";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./field-rules";

/**
 * Flags the auth routes put in the address when they answer a plain form post
 * (one sent before the page hydrated) with a redirect back to its page, and
 * the messages those pages show for them. Codes only: never an email, a
 * password or anything else the person typed. Client-safe.
 */

export const LOGIN_ERRORS: readonly LoginError[] = [
  "invalid-credentials",
  "rate-limited",
  "not-configured",
  "failed",
];

export type ResetRequestFlag = "invalid-email" | "rate-limited" | "unavailable";
export type ResetPasswordFlag = "weak" | "mismatch" | "unavailable";

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
