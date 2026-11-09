/**
 * The From header of an email a workspace sends (Milestone 3): the
 * workspace's sender name, "via Squint", and the address in `EMAIL_FROM`.
 * Account emails (password resets) keep plain `EMAIL_FROM`.
 */

export const FALLBACK_SENDER = "Squint";

/** Longest sender name kept, in characters, before " via Squint". */
export const SENDER_NAME_MAX = 64;

/** A bare address: no spaces, quotes, angle brackets or second @. */
const ADDRESS = /^[^\s"<>@]+@[^\s"<>@]+$/;

/** The address in `EMAIL_FROM` (`Name <a@b>` or `a@b`), or null when it has none. */
export function parseFromAddress(emailFrom: string | null | undefined): string | null {
  const value = emailFrom?.trim() ?? "";
  const address = (/<([^<>]*)>\s*$/.exec(value)?.[1] ?? value).trim();
  return ADDRESS.test(address) ? address : null;
}

/**
 * A sender name that can't break out of its header or pose as an address:
 * line breaks, control characters, double quotes, backticks, backslashes,
 * angle brackets and @ go, spaces collapse, and it's capped at
 * SENDER_NAME_MAX characters. Apostrophes stay ("Dailen's Studio"): inside
 * the quoted name they're plain text.
 */
export function cleanSenderName(name: string | null | undefined): string {
  const cleaned = (name ?? "")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}"`\\<>@]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(cleaned).slice(0, SENDER_NAME_MAX).join("").trim();
}

export interface SenderNames {
  /** `workspaces.from_email_name`: preferred when set. */
  fromEmailName: string | null | undefined;
  workspaceName: string | null | undefined;
}

/**
 * The name a workspace's emails come from: "{from_email_name ?? workspace
 * name} via Squint", or plain "Squint" when neither name has anything left
 * once cleaned. The workspace settings preview it as typed.
 */
export function senderDisplayName(names: SenderNames): string {
  const sender = cleanSenderName(names.fromEmailName) || cleanSenderName(names.workspaceName);
  return sender ? `${sender} via ${FALLBACK_SENDER}` : FALLBACK_SENDER;
}

/**
 * `"{senderDisplayName}" <address>`, with the address from `EMAIL_FROM`. The
 * name is quoted, so commas and other punctuation in it stay part of the
 * name. Null without a usable address.
 */
export function workspaceFromHeader(
  names: SenderNames,
  emailFrom: string | undefined,
): string | null {
  const address = parseFromAddress(emailFrom);
  if (!address) return null;
  return `"${senderDisplayName(names)}" <${address}>`;
}
