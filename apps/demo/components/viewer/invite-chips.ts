import {
  isInviteAddress,
  MAX_INVITES_PER_SEND,
  normalizeAddress,
  splitAddresses,
} from "@/lib/share/invite-addresses";

/**
 * Email chips, for the Share window and the Members page's invites: each
 * address typed or pasted becomes a chip, checked as it's added, up to a
 * cap (`MAX_INVITES_PER_SEND` in the Share window, the seats left in Members).
 */

/**
 * What's wrong with a chip: not an address; (on a preview, in the Share
 * window) not a workspace member; or (in Members) why the server didn't invite it.
 */
export type ChipProblem =
  | "invalid"
  | "outside"
  | "already-member"
  | "already-invited"
  | "in-another-workspace"
  | "cannot-invite";

export interface InviteChip {
  address: string;
  problem: ChipProblem | null;
}

export interface AddedChips {
  chips: InviteChip[];
  /** What became new chips, for the screen reader's "Added …". */
  added: string[];
  /** How many didn't fit under the cap. */
  overflow: number;
}

/** Adds what `text` holds (split like a paste), skipping repeats; past `max`, counts the rest. */
export function addChips(
  chips: readonly InviteChip[],
  text: string,
  max = MAX_INVITES_PER_SEND,
): AddedChips {
  const next = [...chips];
  const added: string[] = [];
  let overflow = 0;
  for (const address of splitAddresses(text)) {
    if (next.some((chip) => chip.address === address)) continue;
    if (next.length >= max) {
      overflow += 1;
      continue;
    }
    next.push({ address, problem: isInviteAddress(address) ? null : "invalid" });
    added.push(address);
  }
  return { chips: next, added, overflow };
}

export function removeChip(chips: readonly InviteChip[], address: string): InviteChip[] {
  return chips.filter((chip) => chip.address !== address);
}

/** Marks the chips the server refused, as it named them. */
export function markChips(
  chips: readonly InviteChip[],
  addresses: readonly string[],
  problem: ChipProblem,
): InviteChip[] {
  const marked = new Set(addresses.map(normalizeAddress));
  return chips.map((chip) => (marked.has(chip.address) ? { ...chip, problem } : chip));
}

/** Ready to send: at least one chip, and nothing wrong with any. */
export function sendableChips(chips: readonly InviteChip[]): boolean {
  return chips.length > 0 && chips.every((chip) => chip.problem === null);
}

const CHIP_REASON: Record<ChipProblem, string> = {
  invalid: "not an email address",
  outside: "not in your workspace",
  "already-member": "already in the workspace",
  "already-invited": "already invited",
  "in-another-workspace": "already in another workspace",
  "cannot-invite": "can't be invited",
};

/** A chip's name for screen readers: the address, and what's wrong with it. */
export function chipLabel(chip: InviteChip): string {
  return chip.problem ? `${chip.address}, ${CHIP_REASON[chip.problem]}` : chip.address;
}

/** The chips that aren't addresses, said once: by address for one, counted for several. */
export function invalidChipsLine(chips: readonly InviteChip[]): string | null {
  const invalid = chips.filter((chip) => chip.problem === "invalid");
  if (invalid.length === 1 && invalid[0]) {
    return `"${invalid[0].address}" isn't an email address. Remove it and type it again.`;
  }
  return invalid.length > 1
    ? `${invalid.length} entries aren't email addresses. Remove the marked ones and type them again.`
    : null;
}

/**
 * The Share window's message under the field: the marked chips, and what
 * didn't fit. Null when nothing is wrong.
 */
export function chipsMessage(chips: readonly InviteChip[], overflow: number): string | null {
  const outside = chips.filter((chip) => chip.problem === "outside");
  const invalid = invalidChipsLine(chips);
  const lines: string[] = invalid ? [invalid] : [];
  if (outside.length) {
    lines.push(
      outside.length === 1
        ? "This preview site only emails people in your workspace. Remove the marked address."
        : "This preview site only emails people in your workspace. Remove the marked addresses.",
    );
  }
  if (overflow) {
    lines.push(`Up to ${MAX_INVITES_PER_SEND} at a time. Send these first, then add the rest.`);
  }
  return lines.length ? lines.join(" ") : null;
}
