import { beforeEach, describe, expect, it } from "vitest";
import { NOW } from "@/test/accounts-fixture";
import { seedLogo, setBrand } from "@/test/brand-fixture";
import {
  discardLog,
  inviteOne,
  membersWorld,
  OWNER_NAME,
  person,
  removeMember,
  WORKSPACE,
  type MembersWorld,
  type Person,
} from "@/test/members-fixture";
import { PNG } from "@/test/workspace-fixture";
import type { SessionUser } from "../../auth/users";
import { PAGE_LOGO_MAX_BYTES } from "../../share/brand-logo";
import { toDate } from "../times";
import { acceptInvite } from "./accept";
import { cancelInvite } from "./cancel-invite";
import { INVITE_TTL_MS } from "./invites";
import { loadJoinPage, type JoinBrand } from "./join-page";

let world: MembersWorld;

beforeEach(async () => {
  world = await membersWorld();
});

const BRAND: JoinBrand = { workspace: WORKSPACE, color: null, logoSrc: null, owner: OWNER_NAME };

const invite = (email: string, now = NOW) => inviteOne(world, world.owner, email, now);

const open = (token: string, session: SessionUser | null = null, now = NOW) =>
  loadJoinPage(world.db, token, session, now);

/** Makes `who` a member of the other workspace (Bravo). */
async function joinBravo(who: Person) {
  await world.db.query(
    "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'member')",
    [who.user.id, world.other.workspaceId],
  );
}

describe("loadJoinPage: links that don't open", () => {
  it("names nothing for an unknown or malformed token", async () => {
    expect(await open("x".repeat(43))).toEqual({ kind: "unknown" });
    expect(await open("not-a-token")).toEqual({ kind: "unknown" });
    expect(await open("")).toEqual({ kind: "unknown" });
  });

  it("names nothing once the workspace is archived or waiting to be deleted", async () => {
    const token = await invite("cleo@x.test");
    await world.db.query("UPDATE workspaces SET delete_after = $2 WHERE id = $1", [
      world.workspaceId,
      toDate(NOW + 1000),
    ]);
    expect(await open(token)).toEqual({ kind: "unknown" });
    await world.db.query(
      "UPDATE workspaces SET delete_after = NULL, archived_at = $2 WHERE id = $1",
      [world.workspaceId, toDate(NOW)],
    );
    expect(await open(token, world.other.owner.user)).toEqual({ kind: "unknown" });
  });
});

describe("loadJoinPage: the invite itself", () => {
  it("says expired, cancelled or used, branded, whoever opens it", async () => {
    const expired = await invite("old@x.test", NOW - INVITE_TTL_MS);
    expect(await open(expired)).toEqual({ kind: "expired", brand: BRAND });
    const cancelled = await invite("gone@x.test");
    await cancelInvite(
      world.db,
      { userId: world.owner.user.id, workspaceId: world.workspaceId },
      await idOf("gone@x.test"),
      NOW,
    );
    expect(await open(cancelled)).toEqual({ kind: "cancelled", brand: BRAND });
    const used = await invite("cleo@x.test");
    const joiner = { account: { name: "Cleo Diaz", password: "a brand new password" } };
    expect(await acceptInvite(world.db, used, joiner, NOW, discardLog())).toMatchObject({
      ok: true,
    });
    expect(await open(used)).toEqual({ kind: "used", brand: BRAND });
    // Someone else signed in still learns the link is used, not that they're the wrong person.
    expect(await open(used, world.other.owner.user)).toEqual({ kind: "used", brand: BRAND });
  });

  it("sends an invitee who's already in to the Overview, even on a used link", async () => {
    const token = await invite("cleo@x.test");
    const joiner = { account: { name: "Cleo Diaz", password: "a brand new password" } };
    await acceptInvite(world.db, token, joiner, NOW, discardLog());
    const cleo = await sessionUser("cleo@x.test");
    expect(await open(token, cleo)).toEqual({ kind: "member" });
  });

  it("says the workspace is full when its limit dropped below its members", async () => {
    const token = await invite("cleo@x.test");
    await world.db.query("UPDATE workspaces SET seat_limit = 1 WHERE id = $1", [world.workspaceId]);
    expect(await open(token)).toEqual({ kind: "full", brand: BRAND });
  });

  it("draws the workspace's color and logo, and says who invited them", async () => {
    await setBrand(world.db, world.workspaceId, { color: "#e03b9d" });
    await seedLogo(world.db, world.workspaceId, PNG);
    const token = await invite("cleo@x.test");
    expect(await open(token)).toEqual({
      kind: "new-person",
      brand: {
        ...BRAND,
        color: "#e03b9d",
        logoSrc: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`,
      },
      email: "cleo@x.test",
      inviter: OWNER_NAME,
    });
  });

  it("draws the monogram for a logo too large to inline, and inlines one at the cap", async () => {
    const png = (size: number) => {
      const bytes = new Uint8Array(size);
      bytes.set(PNG);
      return bytes;
    };
    await seedLogo(world.db, world.workspaceId, png(PAGE_LOGO_MAX_BYTES + 1));
    const token = await invite("cleo@x.test");
    expect(await open(token)).toMatchObject({ kind: "new-person", brand: BRAND });
    const atCap = png(PAGE_LOGO_MAX_BYTES);
    await seedLogo(world.db, world.workspaceId, atCap, { id: "logo-2" });
    expect(await open(token)).toMatchObject({
      brand: { logoSrc: `data:image/png;base64,${Buffer.from(atCap).toString("base64")}` },
    });
  });
});

describe("loadJoinPage: who opened it", () => {
  it("offers a new person the form", async () => {
    const token = await invite("cleo@x.test");
    expect(await open(token)).toEqual({
      kind: "new-person",
      brand: BRAND,
      email: "cleo@x.test",
      inviter: OWNER_NAME,
    });
  });

  it("asks an address with an account to sign in first", async () => {
    await person(world.db, "cleo@x.test");
    const token = await invite("cleo@x.test");
    expect(await open(token)).toEqual({ kind: "sign-in", brand: BRAND, email: "cleo@x.test" });
  });

  it("offers the signed-in invitee one button", async () => {
    const cleo = await person(world.db, "cleo@x.test");
    const token = await invite("cleo@x.test");
    expect(await open(token, cleo.user)).toEqual({
      kind: "join",
      brand: BRAND,
      inviter: OWNER_NAME,
    });
  });

  it("tells another account, or the admin, that it's for someone else", async () => {
    const token = await invite("cleo@x.test");
    const ben = await person(world.db, "ben@x.test");
    expect(await open(token, ben.user)).toEqual({
      kind: "someone-else",
      brand: BRAND,
      signedInAs: "ben@x.test",
      email: "cleo@x.test",
    });
    const admin: SessionUser = { id: ben.user.id, email: "cleo@x.test", name: null, role: "admin" };
    expect(await open(token, admin)).toMatchObject({ kind: "someone-else" });
  });

  it("tells a signed-in invitee in another workspace where they already are", async () => {
    const cleo = await person(world.db, "cleo@x.test");
    const token = await invite("cleo@x.test");
    await joinBravo(cleo);
    expect(await open(token, cleo.user)).toEqual({
      kind: "in-another",
      brand: BRAND,
      other: "Bravo",
    });
  });

  it("stops an address whose account is closing in another workspace before any form", async () => {
    const cleo = await person(world.db, "cleo@x.test");
    const token = await invite("cleo@x.test");
    await joinBravo(cleo);
    await world.db.query("UPDATE users SET deleted_at = $2, delete_after = $3 WHERE id = $1", [
      cleo.user.id,
      toDate(NOW),
      toDate(NOW + 30 * 24 * 3600 * 1000),
    ]);
    const state = await open(token);
    expect(state).toEqual({ kind: "account-closing", brand: BRAND, email: "cleo@x.test" });
    // Never the other workspace's name.
    expect(JSON.stringify(state)).not.toContain("Bravo");
  });

  it("offers the form to an account this invite brings back (removed from here)", async () => {
    const cleo = await person(world.db, "cleo@x.test");
    await world.db.query(
      "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'member')",
      [cleo.user.id, world.workspaceId],
    );
    await removeMember(world.db, cleo.user.id, world.workspaceId, NOW);
    const token = await invite("cleo@x.test");
    expect(await open(token)).toMatchObject({ kind: "new-person", email: "cleo@x.test" });
  });

  it("never accepts on opening", async () => {
    const token = await invite("cleo@x.test");
    const cleo = await person(world.db, "ben@x.test");
    await open(token);
    await open(token, cleo.user);
    const { rows } = await world.db.query(
      "SELECT accepted_at FROM workspace_invites WHERE email = 'cleo@x.test'",
    );
    expect(rows).toEqual([{ accepted_at: null }]);
  });
});

async function idOf(email: string): Promise<string> {
  const { rows } = await world.db.query<{ id: string }>(
    "SELECT id FROM workspace_invites WHERE email = $1",
    [email],
  );
  return rows[0]?.id ?? "";
}

async function sessionUser(email: string): Promise<SessionUser> {
  const { rows } = await world.db.query<{ id: string; name: string | null }>(
    "SELECT id, name FROM users WHERE email = $1",
    [email],
  );
  return { id: rows[0]?.id ?? "", email, name: rows[0]?.name ?? null, role: "company" };
}
