import { isAPIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { insertUser, NOW, PASSWORD } from "@/test/accounts-fixture";
import { addMember, membersWorld, person, type Person } from "@/test/members-fixture";
import { authSecret } from "./auth-secret";
import { authFor, findSessionUser, signInWithPassword } from "./better-auth";
import { authCookieHeader } from "./session-token";

/**
 * The organization plugin reads Squint's workspaces and memberships (050)
 * with Squint's roles, and changes nothing Squint didn't ask for: no
 * workspace is made or deleted through it, and no session gets an active
 * workspace.
 */

const headersOf = ({ cookie }: Person) =>
  new Headers({ cookie: authCookieHeader(cookie.split("=")[1] ?? "", authSecret()) ?? "" });

/** The code of the Better Auth error `call` throws. */
async function refusalOf(call: Promise<unknown>): Promise<string> {
  const error: unknown = await call.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  if (!isAPIError(error)) throw new Error("expected a Better Auth refusal");
  return String((error.body as { code?: unknown } | undefined)?.code);
}

describe("Better Auth's organization plugin on Squint's workspaces", () => {
  it("reads a workspace's memberships as its members, with their role and switches", async () => {
    const world = await membersWorld();
    const member = await addMember(world.db, world.workspaceId, ["trash", "people"]);
    const { members, total } = await authFor(world.db).api.listMembers({
      headers: headersOf(world.owner),
      query: { organizationId: world.workspaceId },
    });
    expect(total).toBe(2);
    const byUser = new Map(members.map((entry) => [entry.userId, entry]));
    expect(byUser.get(world.owner.user.id)).toMatchObject({
      organizationId: world.workspaceId,
      role: "owner",
      permissions: ["review_links", "trash", "import"],
      user: { email: world.owner.user.email },
    });
    expect(byUser.get(member.user.id)).toMatchObject({
      role: "member",
      permissions: ["trash", "people"],
    });
    expect(byUser.get(member.user.id)?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("checks a member's role with Squint's roles", async () => {
    const world = await membersWorld();
    const member = await addMember(world.db, world.workspaceId);
    const auth = authFor(world.db);
    const allows = async (who: Person, permissions: Record<string, string[]>) =>
      (
        await auth.api.hasPermission({
          headers: headersOf(who),
          body: { organizationId: world.workspaceId, permissions },
        })
      ).success;
    expect(await allows(world.owner, { members: ["permissions"] })).toBe(true);
    expect(await allows(member, { workspace: ["write"] })).toBe(true);
    expect(await allows(member, { workspace: ["manage"] })).toBe(false);
    expect(await allows(member, { comment: ["moderate"] })).toBe(false);
  });

  it("makes and deletes no workspace", async () => {
    const world = await membersWorld();
    const auth = authFor(world.db);
    const headers = headersOf(world.owner);
    const { rows: before } = await world.db.query("SELECT id, slug, name FROM workspaces");

    expect(
      await refusalOf(
        auth.api.createOrganization({ headers, body: { name: "Side Gig", slug: "side-gig" } }),
      ),
    ).toBe("YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION");
    expect(
      await refusalOf(
        auth.api.deleteOrganization({ headers, body: { organizationId: world.workspaceId } }),
      ),
    ).toBe("ORGANIZATION_DELETION_DISABLED");

    const { rows: after } = await world.db.query("SELECT id, slug, name FROM workspaces");
    expect(after).toEqual(before);
  });

  it("adds members up to the workspace's seat limit, as Squint stores them, and none past it", async () => {
    const world = await membersWorld();
    await world.db.query("UPDATE workspaces SET seat_limit = 2 WHERE id = $1", [world.workspaceId]);
    const auth = authFor(world.db);
    const join = (who: Person) =>
      auth.api.addMember({
        body: { userId: who.user.id, organizationId: world.workspaceId, role: "member" },
      });
    const [first, second] = [await person(world.db), await person(world.db)];
    await join(first);
    expect(await refusalOf(join(second))).toBe("ORGANIZATION_MEMBERSHIP_LIMIT_REACHED");
    const { rows } = await world.db.query(
      "SELECT user_id, role, permissions FROM memberships WHERE workspace_id = $1 AND role = 'member'",
      [world.workspaceId],
    );
    expect(rows).toEqual([
      { user_id: first.user.id, role: "member", permissions: ["review_links", "trash", "import"] },
    ]);
  });

  it("gives no session an active workspace, signing in or reading it", async () => {
    const world = await membersWorld();
    const email = "cleo@acme.test";
    await insertUser(world.db, email);
    const signedIn = await signInWithPassword(
      world.db,
      { email, password: PASSWORD },
      { ip: "203.0.113.9" },
      NOW,
    );
    const cookie = authCookieHeader(signedIn?.token ?? "", authSecret()) ?? "";
    expect(await findSessionUser(world.db, cookie)).toMatchObject({ email });
    expect(
      await findSessionUser(world.db, headersOf(world.owner).get("cookie") ?? ""),
    ).toMatchObject({ id: world.owner.user.id });
    const { rows } = await world.db.query(
      "SELECT count(*)::int AS count FROM sessions WHERE active_organization_id IS NOT NULL",
    );
    expect(rows).toEqual([{ count: 0 }]);
  });
});
