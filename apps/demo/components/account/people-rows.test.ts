import { describe, expect, it } from "vitest";
import type { MembersData } from "@/lib/workspace/members/members-data";
import { MEMBERS_COPY } from "./members-copy";
import { rowsOf } from "./people-rows";

const COMMON = { workspaceName: "Acme Studio", ownerName: null, ownPermissions: [] };
const ENTRY = { avatarSrc: null, role: "member", joinedAt: 0, you: false } as const;

describe("rowsOf", () => {
  it("shows a nameless person as such in a member's view", () => {
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
    expect(named?.name).toBe("Ben Ito");
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
  });
});
