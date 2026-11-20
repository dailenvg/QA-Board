import { beforeEach, describe, expect, it } from "vitest";
import { NOW, PASSWORD } from "@/test/accounts-fixture";
import {
  addMember,
  AVATAR_URL,
  discardLog,
  giveAvatar,
  inviteOne,
  membersWorld,
  person,
  removeMember,
  switchesOf,
  type MembersWorld,
  type Person,
} from "@/test/members-fixture";
import { readSession } from "@/test/sessions-fixture";
import { ACCOUNT_DELETION_GRACE_MS, REMOVAL_GRACE_MS } from "../../account/account-deletion";
import { tombstoneEmail } from "../../account/account-purge";
import { findOwnWorkspace } from "../../auth/memberships";
import { verifyPassword } from "../../auth/password";
import { toDate } from "../times";
import { acceptInvite, type Joiner } from "./accept";
import { INVITE_TTL_MS } from "./invites";

let world: MembersWorld;

beforeEach(async () => {
  world = await membersWorld();
});

const NEW_PASSWORD = "a brand new password";
const asNew = (name = "Cleo Diaz"): Joiner => ({ account: { name, password: NEW_PASSWORD } });
const asSession = (who: Person): Joiner => ({ session: who.user });

function accept(token: string, joiner: Joiner, now = NOW, log = discardLog()) {
  return acceptInvite(world.db, token, joiner, now, log);
}

async function userRow(email: string) {
  const { rows } = await world.db.query<{
    id: string;
    name: string | null;
    password_hash: string;
    deleted_at: Date | null;
    delete_after: Date | null;
    removed_from: string | null;
    removed_permissions: string[] | null;
    avatar_blob_key: string | null;
  }>(
    `SELECT id, name, password_hash, deleted_at, delete_after, removed_from, removed_permissions,
       avatar_blob_key
     FROM users WHERE email = $1`,
    [email],
  );
  return rows[0];
}

async function inviteState(token: string) {
  const { rows } = await world.db.query<{
    accepted_at: Date | null;
    accepted_user_id: string | null;
  }>(
    `SELECT accepted_at, accepted_user_id FROM workspace_invites
     WHERE token_hash = encode(sha256(convert_to($1, 'UTF8')), 'hex')`,
    [token],
  );
  return rows[0];
}

const invite = (email: string, actor = world.owner, now = NOW) =>
  inviteOne(world, actor, email, now);

describe("acceptInvite: a person without an account", () => {
  it("makes their account, signs them in, and adds them with the invite's switches", async () => {
    const token = await invite("cleo@x.test");
    const result = await accept(token, asNew());
    expect(result).toEqual({
      ok: true,
      workspaceId: world.workspaceId,
      sessionToken: expect.any(String) as unknown,
    });
    const user = await userRow("cleo@x.test");
    expect(user).toMatchObject({ name: "Cleo Diaz", deleted_at: null });
    expect(await verifyPassword(NEW_PASSWORD, user?.password_hash ?? null)).toBe(true);
    const session = await readSession(world.db, result.ok ? (result.sessionToken ?? "") : "", NOW);
    expect(session).toMatchObject({ email: "cleo@x.test", name: "Cleo Diaz", role: "company" });
    expect(await findOwnWorkspace(world.db, user?.id ?? "")).toMatchObject({
      workspaceId: world.workspaceId,
      role: "member",
      permissions: ["review_links", "trash", "import"],
    });
    expect(await inviteState(token)).toEqual({
      accepted_at: new Date(NOW),
      accepted_user_id: user?.id,
    });
    const { rows } = await world.db.query(
      "SELECT action, meta FROM audit_log WHERE action = 'membership.added'",
    );
    expect(rows).toEqual([
      { action: "membership.added", meta: { fields: ["membership"], source: "invite" } },
    ]);
  });

  it("works once: the second answers used", async () => {
    const token = await invite("cleo@x.test");
    expect(await accept(token, asNew())).toMatchObject({ ok: true });
    expect(await accept(token, asNew("Someone else"))).toEqual({ ok: false, reason: "used" });
  });

  it("answers expired, not-found for an unknown link, and not-found once the workspace closed", async () => {
    const token = await invite("cleo@x.test");
    expect(await accept(token, asNew(), NOW + INVITE_TTL_MS)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(await accept("x".repeat(43), asNew())).toEqual({ ok: false, reason: "not-found" });
    await world.db.query("UPDATE workspaces SET delete_after = now() WHERE id = $1", [
      world.workspaceId,
    ]);
    expect(await accept(token, asNew())).toEqual({ ok: false, reason: "not-found" });
    expect(await userRow("cleo@x.test")).toBeUndefined();
  });

  it("refuses when the workspace has no seat left now, and keeps the invite open", async () => {
    const token = await invite("cleo@x.test");
    await world.db.query("UPDATE workspaces SET seat_limit = 1 WHERE id = $1", [world.workspaceId]);
    expect(await accept(token, asNew())).toEqual({ ok: false, reason: "seats-full" });
    expect(await inviteState(token)).toMatchObject({ accepted_at: null });
    expect(await userRow("cleo@x.test")).toBeUndefined();
  });
});

describe("acceptInvite: an address that has an account", () => {
  it("never sets a password on an account that can sign in: sign-in-first, nothing written", async () => {
    const existing = await person(world.db, "cleo@x.test");
    const token = await invite("cleo@x.test");
    const before = await userRow("cleo@x.test");
    expect(await accept(token, asNew())).toEqual({ ok: false, reason: "sign-in-first" });
    expect(await userRow("cleo@x.test")).toEqual(before);
    expect(await verifyPassword(PASSWORD, before?.password_hash ?? null)).toBe(true);
    expect(await switchesOf(world.db, existing.user.id, world.workspaceId)).toBeNull();
    expect(await inviteState(token)).toMatchObject({ accepted_at: null });
  });

  it("joins as the signed-in invitee, without a new session or any change to the account", async () => {
    const cleo = await person(world.db, "cleo@x.test", "Cleo");
    const token = await invite("cleo@x.test");
    const before = await userRow("cleo@x.test");
    expect(await accept(token, asSession(cleo))).toEqual({
      ok: true,
      workspaceId: world.workspaceId,
      sessionToken: null,
    });
    expect(await userRow("cleo@x.test")).toEqual(before);
    expect(await switchesOf(world.db, cleo.user.id, world.workspaceId)).toEqual([
      "review_links",
      "trash",
      "import",
    ]);
  });

  it("refuses a session of another address, and the admin's, before anything", async () => {
    const token = await invite("cleo@x.test");
    const someone = await person(world.db, "dan@x.test");
    const admin = await person(world.db, "root@x.test");
    await world.db.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
    expect(await accept(token, asSession(someone))).toEqual({ ok: false, reason: "wrong-account" });
    expect(await accept(token, { session: { ...admin.user, role: "admin" } })).toEqual({
      ok: false,
      reason: "cannot-join",
    });
    expect(await inviteState(token)).toMatchObject({ accepted_at: null });
  });

  it("refuses a signed-in invitee who is already in another workspace", async () => {
    const cleo = await addMember(world.db, world.other.workspaceId, undefined, "cleo@x.test");
    await world.db.query(
      `INSERT INTO workspace_invites (workspace_id, email, token_hash, token_sealed, expires_at)
       VALUES ($1, 'cleo@x.test', encode(sha256(convert_to($2, 'UTF8')), 'hex'), 'x', $3)`,
      [world.workspaceId, "t".repeat(43), toDate(NOW + 1000)],
    );
    expect(await accept("t".repeat(43), asSession(cleo))).toEqual({
      ok: false,
      reason: "in-another-workspace",
    });
  });

  it("answers account-closing for an account deleted while a member of another workspace", async () => {
    const cleo = await addMember(world.db, world.other.workspaceId, undefined, "cleo@x.test");
    const token = await invite("fresh@x.test");
    await world.db.query(
      "UPDATE workspace_invites SET email = 'cleo@x.test' WHERE email = 'fresh@x.test'",
    );
    await world.db.query("UPDATE users SET deleted_at = $2, delete_after = $3 WHERE id = $1", [
      cleo.user.id,
      toDate(NOW),
      toDate(NOW + ACCOUNT_DELETION_GRACE_MS),
    ]);
    const before = await userRow("cleo@x.test");
    expect(await accept(token, asNew())).toEqual({ ok: false, reason: "account-closing" });
    expect(await userRow("cleo@x.test")).toEqual(before);
  });
});

describe("acceptInvite: an account removed from here, invited back", () => {
  it("still discards the old avatar when starting the session fails after the accept", async () => {
    const cleo = await addMember(world.db, world.workspaceId, undefined, "cleo@x.test");
    await giveAvatar(world.db, cleo.user.id);
    await removeMember(world.db, cleo.user.id, world.workspaceId, NOW);
    const token = await invite("cleo@x.test");
    // Better Auth's insert of the session fails, once the accept has committed.
    await world.db.query("ALTER TABLE sessions DROP COLUMN user_agent");
    const log = discardLog();
    await expect(
      accept(token, asNew("Cleo Again"), NOW + REMOVAL_GRACE_MS - 1000, log),
    ).rejects.toThrow();
    expect(await userRow("cleo@x.test")).toMatchObject({ deleted_at: null, avatar_blob_key: null });
    expect(log.discarded).toEqual([{ kind: "vercel", url: AVATAR_URL }]);
  });

  it("revives it within 24 hours: the same id, new name and password, no avatar, no removal", async () => {
    const cleo = await addMember(
      world.db,
      world.workspaceId,
      ["review_links", "trash", "import"],
      "cleo@x.test",
    );
    await giveAvatar(world.db, cleo.user.id);
    await removeMember(world.db, cleo.user.id, world.workspaceId, NOW);
    const token = await invite("cleo@x.test");
    const log = discardLog();
    const result = await accept(token, asNew("Cleo Again"), NOW + REMOVAL_GRACE_MS - 1000, log);
    expect(result).toMatchObject({ ok: true });
    expect(await userRow("cleo@x.test")).toMatchObject({
      id: cleo.user.id,
      name: "Cleo Again",
      deleted_at: null,
      delete_after: null,
      removed_from: null,
      removed_permissions: null,
      avatar_blob_key: null,
    });
    expect(
      await verifyPassword(NEW_PASSWORD, (await userRow("cleo@x.test"))?.password_hash ?? null),
    ).toBe(true);
    expect((await world.db.query("SELECT 1 FROM user_blobs")).rows).toEqual([]);
    expect(log.discarded).toEqual([{ kind: "vercel", url: AVATAR_URL }]);
    const { rows } = await world.db.query<{ action: string }>(
      "SELECT action FROM audit_log WHERE target_id = $1 ORDER BY id",
      [cleo.user.id],
    );
    expect(rows.map((row) => row.action)).toEqual([
      "membership.removed",
      "user.deletion_scheduled",
      "user.restored",
      "membership.added",
    ]);
  });

  it("keeps no more than the switches they had here: a removal can't widen them (B2)", async () => {
    const cleo = await addMember(
      world.db,
      world.workspaceId,
      ["review_links", "trash"],
      "cleo@x.test",
    );
    await removeMember(world.db, cleo.user.id, world.workspaceId, NOW);
    const token = await invite("cleo@x.test");
    await accept(token, asNew(), NOW + 1000);
    expect(await switchesOf(world.db, cleo.user.id, world.workspaceId)).toEqual([
      "review_links",
      "trash",
    ]);
  });

  it("also narrows a manager's re-invite: their own switches, and the old ones", async () => {
    const manager = await addMember(world.db, world.workspaceId, ["trash", "import", "people"]);
    const cleo = await addMember(
      world.db,
      world.workspaceId,
      ["review_links", "trash"],
      "cleo@x.test",
    );
    await removeMember(world.db, cleo.user.id, world.workspaceId, NOW);
    const token = await invite("cleo@x.test", manager);
    await accept(token, asNew(), NOW + 1000);
    expect(await switchesOf(world.db, cleo.user.id, world.workspaceId)).toEqual(["trash"]);
  });

  it("replaces it after 24 hours, still narrowed until the purge scrubs the old row", async () => {
    const cleo = await addMember(world.db, world.workspaceId, ["trash"], "cleo@x.test");
    await removeMember(world.db, cleo.user.id, world.workspaceId, NOW);
    const token = await invite("cleo@x.test", world.owner, NOW + REMOVAL_GRACE_MS);
    const log = discardLog();
    await giveAvatar(world.db, cleo.user.id);
    expect(await accept(token, asNew(), NOW + REMOVAL_GRACE_MS, log)).toMatchObject({ ok: true });
    const fresh = await userRow("cleo@x.test");
    expect(fresh?.id).not.toBe(cleo.user.id);
    expect(await switchesOf(world.db, fresh?.id ?? "", world.workspaceId)).toEqual(["trash"]);
    const { rows } = await world.db.query(
      "SELECT email, name, deleted_at IS NOT NULL AS deleted, delete_after FROM users WHERE id = $1",
      [cleo.user.id],
    );
    expect(rows).toEqual([
      { email: tombstoneEmail(cleo.user.id), name: null, deleted: true, delete_after: null },
    ]);
    expect(log.discarded).toEqual([{ kind: "vercel", url: AVATAR_URL }]);
  });
});

describe("acceptInvite: other deleted accounts", () => {
  it("replaces an account removed from another workspace: a new person, the defaults", async () => {
    const cleo = await addMember(world.db, world.other.workspaceId, ["import"], "cleo@x.test");
    await removeMember(world.db, cleo.user.id, world.other.workspaceId, NOW);
    const token = await invite("cleo@x.test");
    expect(await accept(token, asNew(), NOW + 1000)).toMatchObject({ ok: true });
    const fresh = await userRow("cleo@x.test");
    expect(fresh?.id).not.toBe(cleo.user.id);
    expect(fresh?.removed_from).toBeNull();
    expect(await switchesOf(world.db, fresh?.id ?? "", world.workspaceId)).toEqual([
      "review_links",
      "trash",
      "import",
    ]);
    expect(await switchesOf(world.db, cleo.user.id, world.other.workspaceId)).toBeNull();
  });

  it("revives a member here who deleted their own account, keeping no more than their switches", async () => {
    const cleo = await addMember(world.db, world.workspaceId, ["review_links"], "cleo@x.test");
    await world.db.query("UPDATE users SET deleted_at = $2, delete_after = $3 WHERE id = $1", [
      cleo.user.id,
      toDate(NOW),
      toDate(NOW + ACCOUNT_DELETION_GRACE_MS),
    ]);
    const token = await invite("cleo@x.test");
    expect(await accept(token, asNew("Cleo Back"), NOW + 1000)).toMatchObject({ ok: true });
    expect(await userRow("cleo@x.test")).toMatchObject({
      id: cleo.user.id,
      name: "Cleo Back",
      deleted_at: null,
    });
    expect(await switchesOf(world.db, cleo.user.id, world.workspaceId)).toEqual(["review_links"]);
    const { rows } = await world.db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM memberships WHERE user_id = $1",
      [cleo.user.id],
    );
    expect(rows[0]?.count).toBe(1);
  });
});

describe("what a new member can do (B2)", () => {
  it("joins without trash when a manager without trash invited them, and never with people", async () => {
    const manager = await addMember(world.db, world.workspaceId, ["review_links", "people"]);
    const token = await invite("cleo@x.test", manager);
    const result = await accept(token, asNew());
    const cleo = await userRow("cleo@x.test");
    expect(result).toMatchObject({ ok: true });
    expect(await switchesOf(world.db, cleo?.id ?? "", world.workspaceId)).toEqual(["review_links"]);
  });

  it("never gets people from an accept, even when the old row had it", async () => {
    const cleo = await addMember(
      world.db,
      world.workspaceId,
      ["review_links", "people"],
      "cleo@x.test",
    );
    await removeMember(world.db, cleo.user.id, world.workspaceId, NOW);
    const token = await invite("cleo@x.test");
    await accept(token, asNew(), NOW + 1000);
    expect(await switchesOf(world.db, cleo.user.id, world.workspaceId)).toEqual(["review_links"]);
  });
});
