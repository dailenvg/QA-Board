import { invalidChipsLine, type InviteChip } from "../viewer/invite-chips";
import { MEMBERS_COPY } from "./members-copy";

const REFUSED = MEMBERS_COPY.invite.refused;

/**
 * What's wrong under Members' invite field (4b.2): addresses that aren't
 * addresses, the server's reason for each address it didn't invite (except
 * already-invited, which has its own line with Resend below), and anything
 * typed past the seats left. Null when nothing is.
 */
export function inviteFieldMessage(
  chips: readonly InviteChip[],
  overflow: number,
  { workspace, left }: { workspace: string; left: number },
): string | null {
  const lines: string[] = [];
  const invalid = invalidChipsLine(chips);
  if (invalid) lines.push(invalid);
  for (const chip of chips) {
    if (chip.problem === "already-member") {
      lines.push(REFUSED["already-member"](chip.address, workspace));
    } else if (chip.problem === "in-another-workspace") {
      lines.push(REFUSED["in-another-workspace"](chip.address));
    }
  }
  if (chips.some((chip) => chip.problem === "cannot-invite")) lines.push(REFUSED["cannot-invite"]);
  if (overflow) lines.push(MEMBERS_COPY.invite.overflow(left, overflow));
  return lines.length ? lines.join(" ") : null;
}
