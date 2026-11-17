import type { MemberSwitch } from "@/lib/auth/permissions";
import type { MembersData } from "@/lib/workspace/members/members-data";
import { MEMBERS_COPY } from "./members-copy";

const COPY = MEMBERS_COPY.people;

/** One person as the row shows them, whichever view the page is. */
export interface PersonRow {
  key: string;
  /** What the row calls them: their name, else their email, else "No name yet". */
  name: string;
  avatarSrc: string | null;
  isOwner: boolean;
  you: boolean;
  joinedAt: number;
  /** The owner's and managers' views only. */
  email: string | null;
  /** The member's user id, when this view may act on them. */
  id: string | null;
  removable: boolean;
  /** Their switches: in the owner's view, on members' rows only. */
  permissions: readonly MemberSwitch[] | null;
}

/** Each person in the page's data as a row, whatever the view. */
export function rowsOf(data: MembersData): PersonRow[] {
  if (data.view === "member") {
    return data.members.map((member) => {
      const name = member.name?.trim() || null;
      return {
        key: member.key,
        name: name ?? COPY.noName,
        avatarSrc: member.avatarSrc,
        isOwner: member.role === "owner",
        you: member.you,
        joinedAt: member.joinedAt,
        email: null,
        id: null,
        removable: false,
        permissions: null,
      };
    });
  }
  return data.members.map((member) => {
    const name = member.name?.trim() || null;
    return {
      key: member.key,
      name: name ?? member.email,
      avatarSrc: member.avatarSrc,
      isOwner: member.role === "owner",
      you: member.you,
      joinedAt: member.joinedAt,
      email: member.email,
      id: member.id,
      removable: member.removable,
      permissions: member.permissions ?? null,
    };
  });
}
