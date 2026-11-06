/**
 * Field rules shared by the sign-in and reset forms (on blur) and the server
 * (zod, in `schemas.ts`), so both say the same thing. No server imports: the
 * forms bundle this.
 */

export const PASSWORD_MIN_LENGTH = 12;
/** Argon2 hashes any length; this only keeps a request from making it hash megabytes. */
export const PASSWORD_MAX_LENGTH = 256;
export const EMAIL_MAX_LENGTH = 320;

/** Loose on purpose: the account lookup is the real check; this only catches typos early. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** How emails are stored and compared: trimmed, lowercased. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function emailError(value: string): string | null {
  const email = value.trim();
  if (!email) return "Enter your email address.";
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_SHAPE.test(email)) {
    return "Enter an email address like name@company.com.";
  }
  return null;
}

/** The sign-in form's password: anything typed, within the length cap. */
export function passwordError(value: string): string | null {
  if (!value) return "Enter your password.";
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Passwords are at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}

export function newPasswordError(value: string): string | null {
  if (!value) return "Choose a new password.";
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}

export function confirmPasswordError(password: string, confirm: string): string | null {
  if (!confirm) return "Type the new password again.";
  return confirm === password ? null : "The two passwords don't match.";
}
