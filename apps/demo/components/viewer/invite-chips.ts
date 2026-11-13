import {
  isInviteAddress,
  MAX_INVITES_PER_SEND,
  normalizeAddress,
  splitAddresses,
} from "@/lib/share/invite-addresses";

/**
 * The Share window's email chips: each address typed or pasted becomes a
 * chip, checked as it's added, at most `MAX_INVITES_PER_SEND` of them.
 */

/** What's wrong with a chip: not an address, or (on a preview) not a workspace member. */
export type ChipProblem = "invalid" | "outside";

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

/** Adds what `text` holds (split like a paste), skipping repeats; past the cap, counts the rest. */
export function addChips(chips: readonly InviteChip[], text: string): AddedChips {
  const next = [...chips];
  const added: string[] = [];
  let overflow = 0;
  for (const address of splitAddresses(text)) {
    if (next.some((chip) => chip.address === address)) continue;
    if (next.length >= MAX_INVITES_PER_SEND) {
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
};

/** A chip's name for screen readers: the address, and what's wrong with it. */
export function chipLabel(chip: InviteChip): string {
  return chip.problem ? `${chip.address}, ${CHIP_REASON[chip.problem]}` : chip.address;
}

/** What's wrong, under the field: the marked chips, and what didn't fit. Null when nothing is. */
export function chipsMessage(chips: readonly InviteChip[], overflow: number): string | null {
  const invalid = chips.filter((chip) => chip.problem === "invalid");
  const outside = chips.filter((chip) => chip.problem === "outside");
  const lines: string[] = [];
  if (invalid.length === 1 && invalid[0]) {
    lines.push(`"${invalid[0].address}" isn't an email address. Remove it and type it again.`);
  } else if (invalid.length > 1) {
    lines.push(
      `${invalid.length} entries aren't email addresses. Remove the marked ones and type them again.`,
    );
  }
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
