/**
 * Field rules for the account settings forms (on blur) and their routes (zod,
 * in `schemas.ts`), so both say the same thing. No server imports: the forms
 * bundle this.
 */

import { normalizeEmail, PASSWORD_MAX_LENGTH } from "../auth/field-rules";

/** As the database checks it (`users_name_length`): characters once trimmed, not UTF-16 units. */
export const NAME_MAX_LENGTH = 80;

/** Characters, as Postgres counts them: an emoji is one. */
function characters(value: string): number {
  return Array.from(value).length;
}

export function displayNameError(value: string): string | null {
  const name = value.trim();
  if (!name) return "Enter your name.";
  if (characters(name) > NAME_MAX_LENGTH) return `Use at most ${NAME_MAX_LENGTH} characters.`;
  return null;
}

/** The password that proves it's you: anything typed, within the length cap. */
export function currentPasswordError(value: string): string | null {
  if (!value) return "Enter your current password.";
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Passwords are at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}

/** Whether `value` is the address the account already has, as stored. */
export function isCurrentEmail(value: string, currentEmail: string): boolean {
  return normalizeEmail(value) === normalizeEmail(currentEmail);
}
