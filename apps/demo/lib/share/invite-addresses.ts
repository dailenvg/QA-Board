/**
 * The addresses a review link's invitation goes to, as the Share window takes
 * them and the invites route checks them again: lowercased, trimmed, deduped,
 * at most `MAX_INVITES_PER_SEND` at a time. Plain functions, for the browser
 * and the server alike.
 */

/** Addresses one send takes. */
export const MAX_INVITES_PER_SEND = 10;

/** Longest address taken (RFC 5321's path limit), and its local part's. */
const ADDRESS_MAX = 254;
const LOCAL_MAX = 64;

/** One @, no spaces or the characters that end an address in a header or a list, a dotted domain. */
const ADDRESS = /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\.]+(\.[^\s@<>()[\]",;:\\.]+)+$/;

/** How an address is compared and sent: trimmed and lowercased. */
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

/** Whether a normalized address looks deliverable enough to send to. */
export function isInviteAddress(address: string): boolean {
  if (address.length > ADDRESS_MAX || !ADDRESS.test(address)) return false;
  const local = address.slice(0, address.lastIndexOf("@"));
  return local.length <= LOCAL_MAX;
}

/** Typed or pasted text, split where people separate addresses: commas, semicolons, spaces, lines. */
export function splitAddresses(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map(normalizeAddress)
    .filter(Boolean);
}

export interface Invitees {
  /** Normalized, valid, deduped, in the order given. */
  addresses: string[];
  /** What didn't look like an address, as given (trimmed), deduped. */
  invalid: string[];
}

/** Sorts a list into the addresses to send to and what isn't one. */
export function prepareInvitees(list: readonly string[]): Invitees {
  const addresses = new Set<string>();
  const invalid = new Set<string>();
  for (const raw of list) {
    const address = normalizeAddress(raw);
    if (!address) continue;
    if (isInviteAddress(address)) addresses.add(address);
    else invalid.add(raw.trim());
  }
  return { addresses: [...addresses], invalid: [...invalid] };
}
