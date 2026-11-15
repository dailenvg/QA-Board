import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOW } from "@/test/accounts-fixture";
import {
  addMember,
  deps,
  EMAIL_OFF,
  EMAIL_ON,
  membersWorld,
  OWNER_NAME,
  PREVIEW,
  SITE,
  WORKSPACE,
  type MembersWorld,
  type Person,
} from "@/test/members-fixture";
import { findMembership } from "../../auth/memberships";
import { toDate } from "../times";
import { createInvites } from "./create-invites";
import { INVITE_TTL_MS } from "./invites";
import { loadMembersData } from "./members-data";

let world: MembersWorld;
let ben: Person;
let leaving: Person;

beforeEach(async () => {
  world = await membersWorld();
  ben = await addMember(world.db, world.workspaceId, ["trash"], "ben@acme.test");
  await world.db.query("UPDATE users SET name = 'Ben Ito' WHERE id = $1", [ben.user.id]);
  leaving = await addMember(world.db, world.workspaceId, undefined, "lea@acme.test");
  await world.db.query("UPDATE users SET deleted_at = $2, delete_after = $3 WHERE id = $1", [
    leaving.user.id,
    toDate(NOW),
    toDate(NOW + 30 * 24 * 3600 * 1000),
  ]);
  await createInvites(
    world.db,
    { userId: world.owner.user.id, workspaceId: world.workspaceId },
    ["cleo@x.test"],
    NOW,
    deps(EMAIL_OFF),
  );
  await createInvites(
    world.db,
    { userId: world.owner.user.id, workspaceId: world.workspaceId },
    ["old@x.test"],
    NOW - INVITE_TTL_MS - 1000,
    deps(EMAIL_OFF),
  );
});

async function dataFor(who: Person, env: Record<string, string> = EMAIL_OFF) {
  const membership = await findMembership(world.db, who.user.id, world.workspaceId);
  if (!membership) throw new Error("not a member");
  return loadMembersData(world.db, who.user.id, membership, NOW, env);
}

describe("loadMembersData", () => {
  it("gives the owner emails, switches, open invites with their links, seats and leaving members", async () => {
    const data = await dataFor(world.owner);
    expect(data).toEqual({
      view: "owner",
      workspaceName: WORKSPACE,
      ownerName: OWNER_NAME,
      members: [
        {
          id: world.owner.user.id,
          name: OWNER_NAME,
          email: world.owner.user.email,
          role: "owner",
          joinedAt: expect.any(Number) as unknown,
          you: true,
        },
        {
          id: ben.user.id,
          name: "Ben Ito",
          email: "ben@acme.test",
          role: "member",
          joinedAt: expect.any(Number) as unknown,
          you: false,
          permissions: ["trash"],
        },
      ],
      seats: { used: 3, limit: 10 },
      emailEnabled: false,
      invites: [
        {
          id: expect.any(String) as unknown,
          email: "old@x.test",
          invitedBy: OWNER_NAME,
          createdAt: NOW - INVITE_TTL_MS - 1000,
          expiresAt: NOW - 1000,
          expired: true,
          link: null,
          emailNotSent: true,
        },
        {
          id: expect.any(String) as unknown,
          email: "cleo@x.test",
          invitedBy: OWNER_NAME,
          createdAt: NOW,
          expiresAt: NOW + INVITE_TTL_MS,
          expired: false,
          link: expect.stringMatching(new RegExp(`^${SITE}/join/[A-Za-z0-9_-]{43}$`)) as unknown,
          emailNotSent: true,
        },
      ],
      leaving: [
        {
          id: leaving.user.id,
          name: null,
          email: "lea@acme.test",
          until: NOW + 30 * 24 * 3600 * 1000,
        },
      ],
      ownPermissions: ["review_links", "trash", "import", "people"],
    });
  });

  it("gives a member with people the same, without anyone's switches (D4)", async () => {
    await world.db.query(
      "UPDATE memberships SET permissions = ARRAY['people'] WHERE user_id = $1",
      [ben.user.id],
    );
    const data = await dataFor(ben);
    expect(data).toMatchObject({ view: "manager", ownPermissions: ["people"] });
    if (data.view === "member") throw new Error("member view");
    expect(data.members.map((member) => "permissions" in member)).toEqual([false, false]);
    expect(data.members.map((member) => member.you)).toEqual([false, true]);
    expect(data.invites.map((invite) => invite.email)).toEqual(["old@x.test", "cleo@x.test"]);
    expect(data.leaving).toHaveLength(1);
  });

  it("gives a member without people names, roles and dates only, and their own switches (D5)", async () => {
    expect(await dataFor(ben)).toEqual({
      view: "member",
      workspaceName: WORKSPACE,
      ownerName: OWNER_NAME,
      members: [
        { name: OWNER_NAME, role: "owner", joinedAt: expect.any(Number) as unknown, you: false },
        { name: "Ben Ito", role: "member", joinedAt: expect.any(Number) as unknown, you: true },
      ],
      ownPermissions: ["trash"],
    });
  });

  it("says whether email is on: off without Resend and on a preview", async () => {
    expect(await dataFor(world.owner, EMAIL_ON)).toMatchObject({ emailEnabled: true });
    expect(await dataFor(world.owner, PREVIEW)).toMatchObject({ emailEnabled: false });
  });

  it("marks an invite whose email went out as sent, until a later one fails", async () => {
    await world.db.query("UPDATE workspace_invites SET last_sent_at = $1", [toDate(NOW)]);
    const sent = await dataFor(world.owner);
    expect(sent.view !== "member" && sent.invites.map((invite) => invite.emailNotSent)).toEqual([
      false,
      false,
    ]);
    await world.db.query("UPDATE workspace_invites SET last_send_error_at = $1", [toDate(NOW + 1)]);
    const failed = await dataFor(world.owner);
    expect(failed.view !== "member" && failed.invites.map((invite) => invite.emailNotSent)).toEqual(
      [true, true],
    );
  });

  it("leaves a link out when its sealed token no longer opens, and still loads", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const data = await dataFor(world.owner, {
      ...EMAIL_OFF,
      AUTH_SECRET: "another-secret-entirely",
    });
    expect(data.view !== "member" && data.invites.map((invite) => invite.link)).toEqual([
      null,
      null,
    ]);
    expect(errors.mock.calls).toEqual([
      ["squint members: invite link unreadable (LoggableError: Sealed secret did not open)"],
    ]);
  });
});
