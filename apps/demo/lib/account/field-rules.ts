/**
 * Field rules for the account settings forms (on blur) and their routes (zod,
 * in `schemas.ts`), so both say the same thing. No server imports: the forms
 * bundle this.
 */

import { normalizeEmail, PASSWORD_MAX_LENGTH } from "../auth/field-rules";
import { brandColorContrast } from "../brand-palette";
import { cleanSenderName, SENDER_NAME_MAX } from "../email/from-header";

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

/** As the database checks it (009's CHECK on `workspaces.name`). */
export const WORKSPACE_NAME_MAX_LENGTH = 80;

export function workspaceNameError(value: string): string | null {
  const name = value.trim();
  if (!name) return "Enter your workspace's name.";
  if (characters(name) > WORKSPACE_NAME_MAX_LENGTH) {
    return `Use at most ${WORKSPACE_NAME_MAX_LENGTH} characters.`;
  }
  return null;
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * A typed brand color as stored: `#rrggbb`, lowercase (`#ABC` and `abc123`
 * are fine to type), or null when it isn't a hex color. Blank is null too.
 */
export function normalizeBrandColor(value: string): string | null {
  const digits = HEX.exec(value.trim())?.[1]?.toLowerCase();
  if (!digits) return null;
  return `#${digits.length === 3 ? digits.replace(/./g, (digit) => digit + digit) : digits}`;
}

/** Blank is fine (Squint's own blue stands in); otherwise a hex color that stands out on white. */
export function brandColorError(value: string): string | null {
  if (!value.trim()) return null;
  const color = normalizeBrandColor(value);
  if (!color) return "Enter a hex color, like #1157ce.";
  if (brandColorContrast(color).some((surface) => !surface.passes)) {
    return "That color is too light to stand out on a white page. Pick a darker shade.";
  }
  return null;
}

/** Spaces collapsed and trimmed, as the From header will show the name. */
function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Blank is fine (emails use the workspace's name); otherwise at most 64
 * characters, none of which the From header would have to drop.
 */
export function senderNameError(value: string): string | null {
  const name = collapseSpaces(value);
  if (!name) return null;
  if (characters(name) > SENDER_NAME_MAX) return `Use at most ${SENDER_NAME_MAX} characters.`;
  if (cleanSenderName(name) !== name) {
    return "Leave out quotes, angle brackets, @, backslashes and backticks.";
  }
  return null;
}

/** A sender name as stored: spaces collapsed, or null when blank. */
export function normalizeSenderName(value: string): string | null {
  return collapseSpaces(value) || null;
}
