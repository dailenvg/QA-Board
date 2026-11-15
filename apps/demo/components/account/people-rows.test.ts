import { describe, expect, it } from "vitest";
import { monogramInitials, personMonogramName } from "@/lib/monogram";
import type { MembersData } from "@/lib/workspace/members/members-data";
import { MEMBERS_COPY } from "./members-copy";
import { rowsOf } from "./people-rows";

const COMMON = { workspaceName: "Acme Studio", ownerName: null, ownPermissions: [] };
const ENTRY = { avatarSrc: null, role: "member", joinedAt: 0, you: false } as const;

/** The initials a row's avatar draws, as `PersonAvatar` works them out. */
const initials = (row: { avatarName: string | null; fallback: string }) =>
  monogramInitials(personMonogramName(row.avatarName, row.fallback));

describe("rowsOf", () => {
  it("shows a nameless person as such in a member's view, with no initials made from it", () => {
    const data: MembersData = {
      ...COMMON,
      view: "member",
      members: [
        { ...ENTRY, key: "a", name: null },
        { ...ENTRY, key: "b", name: "  " },
        { ...ENTRY, key: "c", name: "Ben Ito" },
      ],
    };
    const [nameless, blank, named] = rowsOf(data);
    expect(nameless?.name).toBe(MEMBERS_COPY.people.noName);
    expect(blank?.name).toBe(MEMBERS_COPY.people.noName);
    // The plain tile, as for anyone without a name or an email to draw from: never "NY".
    expect(nameless && initials(nameless)).toBe("");
    expect(blank && initials(blank)).toBe("");
    expect(named && initials(named)).toBe("BI");
  });

  it("names a nameless person by their email in the owner's view, as the sidebar does", () => {
    const data: MembersData = {
      ...COMMON,
      view: "owner",
      seats: { used: 1, limit: 10 },
      emailEnabled: false,
      invites: [],
      leaving: [],
      members: [
        { ...ENTRY, key: "a", name: null, id: "u1", email: "ben@acme.test", removable: true },
      ],
    };
    const [row] = rowsOf(data);
    expect(row?.name).toBe("ben@acme.test");
    expect(row && initials(row)).toBe(monogramInitials(personMonogramName(null, "ben@acme.test")));
  });
});
