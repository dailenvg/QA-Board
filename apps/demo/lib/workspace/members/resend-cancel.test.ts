import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOW } from "@/test/accounts-fixture";
import {
  addMember,
  deps,
  discardLog,
  EMAIL_OFF,
  EMAIL_ON,
  membersWorld,
  type MembersWorld,
  type Person,
} from "@/test/members-fixture";
import { acceptInvite } from "./accept";
import { cancelInvite } from "./cancel-invite";
import { createInvites } from "./create-invites";
import { MAX_INVITE_EMAILS } from "./invite-sends";
import { INVITE_TTL_MS, RESEND_COOLDOWN_MS } from "./invites";
import { resendInvite } from "./resend-invite";

let world: MembersWorld;

beforeEach(async () => {
  world = await membersWorld();
});

const actorOf = (who: Person) => ({ userId: who.user.id, workspaceId: world.workspaceId });

/** Invites `email` as the owner and answers its id and link. */
async function invited(email: string, env = EMAIL_OFF, now = NOW) {
  const made = await createInvites(world.db, actorOf(world.owner), [email], now, deps(env));
  const result = made.ok ? made.results[0] : undefined;
  if (!result?.ok) throw new Error("not invited");
  return result.invite;
}

const resend = (
  id: string,
  { actor = world.owner, env = EMAIL_OFF, now = NOW, fail = false } = {},
) => {
  const options = deps(env, fail);
  return resendInvite(world.db, actorOf(actor), id, now, options).then((outcome) => ({
    outcome,
    batches: options.batches,
  }));
};

async function row(id: string) {
  const { rows } = await world.db.query<{
    expires_at: Date;
    send_count: number;
    last_sent_at: Date | null;
    last_send_error_at: Date | null;
    revoked_at: Date | null;
  }>(
    `SELECT expires_at, send_count, last_sent_at, last_send_error_at, revoked_at
     FROM workspace_invites WHERE id = $1`,
    [id],
  );
  return rows[0];
}

describe("resendInvite", () => {
  it("emails the same link again, renews it for 7 days from now, and answers both", async () => {
    const invite = await invited("cleo@x.test", EMAIL_ON);
    const later = NOW + 3 * 24 * 3600 * 1000;
    const { outcome, batches } = await resend(invite.id, { env: EMAIL_ON, now: later });
    expect(outcome).toEqual({ ok: true, emailed: true, expiresAt: later + INVITE_TTL_MS });
    expect(batches).toHaveLength(1);
    expect(batches[0]?.invites).toEqual([
      { workspace: "Acme Studio", inviter: "Ana Ruiz", email: "cleo@x.test", link: invite.link },
    ]);
    expect(await row(invite.id)).toMatchObject({
      expires_at: new Date(later + INVITE_TTL_MS),
      send_count: 2,
      last_sent_at: new Date(later),
    });
  });

  it("renews without sending with email off, and says so", async () => {
    const invite = await invited("cleo@x.test");
    const { outcome, batches } = await resend(invite.id, { now: NOW + 1000 });
    expect(outcome).toEqual({ ok: true, emailed: false, expiresAt: NOW + 1000 + INVITE_TTL_MS });
    expect(batches).toEqual([]);
    // No email went out, so there's no cooldown either.
    expect((await resend(invite.id, { now: NOW + 2000 })).outcome).toMatchObject({ ok: true });
  });

  it("records a refused email, and keeps the renewal", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const invite = await invited("cleo@x.test", EMAIL_ON);
    const later = NOW + RESEND_COOLDOWN_MS;
    const { outcome } = await resend(invite.id, { env: EMAIL_ON, now: later, fail: true });
    expect(outcome).toEqual({ ok: true, emailed: false, expiresAt: later + INVITE_TTL_MS });
    expect(await row(invite.id)).toMatchObject({
      send_count: 1,
      last_send_error_at: new Date(later),
    });
  });

  it("waits a minute after an email went out", async () => {
    const invite = await invited("cleo@x.test", EMAIL_ON);
    expect((await resend(invite.id, { env: EMAIL_ON, now: NOW + 15_000 })).outcome).toEqual({
      ok: false,
      reason: "cooldown",
      retryAfterSeconds: 45,
    });
    expect((await row(invite.id))?.expires_at).toEqual(new Date(NOW + INVITE_TTL_MS));
  });

  it("takes a seat again for an expired invite, and refuses without one", async () => {
    const invite = await invited("cleo@x.test");
    const later = NOW + INVITE_TTL_MS + 1000;
    for (let seat = 0; seat < 8; seat += 1) await addMember(world.db, world.workspaceId);
    await invited("dan@x.test", EMAIL_OFF, later);
    expect((await resend(invite.id, { now: later })).outcome).toEqual({
      ok: false,
      reason: "seats-full",
      seats: { used: 10, limit: 10 },
    });
    await world.db.query("UPDATE workspaces SET seat_limit = 11 WHERE id = $1", [
      world.workspaceId,
    ]);
    expect((await resend(invite.id, { now: later })).outcome).toMatchObject({ ok: true });
  });

  it("counts against the day's emails, and refuses over them", async () => {
    await world.db.query("UPDATE workspaces SET seat_limit = 100 WHERE id = $1", [
      world.workspaceId,
    ]);
    const emails = Array.from({ length: MAX_INVITE_EMAILS }, (_, i) => `a${i}@x.test`);
    const made = await createInvites(world.db, actorOf(world.owner), emails, NOW, deps(EMAIL_ON));
    const first = made.ok && made.results[0]?.ok ? made.results[0].invite.id : "";
    const { outcome } = await resend(first, { env: EMAIL_ON, now: NOW + RESEND_COOLDOWN_MS });
    expect(outcome).toMatchObject({
      ok: false,
      reason: "rate-limited",
      sentInWindow: MAX_INVITE_EMAILS,
      limit: MAX_INVITE_EMAILS,
    });
  });

  it("finds nothing for a used, cancelled or another workspace's invite", async () => {
    const used = await invited("used@x.test");
    await acceptInvite(
      world.db,
      used.link.split("/").at(-1) ?? "",
      { account: { name: "Used", password: "a long enough password" } },
      NOW,
      discardLog(),
    );
    const cancelled = await invited("gone@x.test");
    await cancelInvite(world.db, actorOf(world.owner), cancelled.id, NOW);
    for (const id of [used.id, cancelled.id]) {
      expect((await resend(id)).outcome).toEqual({ ok: false, reason: "not-found" });
    }
    const theirs = await createInvites(
      world.db,
      { userId: world.other.owner.user.id, workspaceId: world.other.workspaceId },
      ["x@x.test"],
      NOW,
      deps(),
    );
    const theirId = theirs.ok && theirs.results[0]?.ok ? theirs.results[0].invite.id : "";
    expect((await resend(theirId)).outcome).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("who manages invites (D2)", () => {
  it("lets a member with people resend and cancel the owner's invite", async () => {
    const manager = await addMember(world.db, world.workspaceId, ["people"]);
    const invite = await invited("cleo@x.test");
    expect((await resend(invite.id, { actor: manager, now: NOW + 1 })).outcome).toMatchObject({
      ok: true,
    });
    expect(await cancelInvite(world.db, actorOf(manager), invite.id, NOW)).toEqual({ ok: true });
  });

  it("refuses a member without people, changing nothing", async () => {
    const member = await addMember(world.db, world.workspaceId);
    const invite = await invited("cleo@x.test");
    expect((await resend(invite.id, { actor: member, now: NOW + 1 })).outcome).toEqual({
      ok: false,
      reason: "not-allowed",
    });
    expect(await cancelInvite(world.db, actorOf(member), invite.id, NOW)).toEqual({
      ok: false,
      reason: "not-allowed",
    });
    expect(await row(invite.id)).toMatchObject({
      expires_at: new Date(NOW + INVITE_TTL_MS),
      revoked_at: null,
    });
  });
});

describe("cancelInvite", () => {
  it("ends the link and frees its seat at once, once, and answers the same again", async () => {
    await world.db.query("UPDATE workspaces SET seat_limit = 2 WHERE id = $1", [world.workspaceId]);
    const invite = await invited("cleo@x.test");
    expect(await cancelInvite(world.db, actorOf(world.owner), invite.id, NOW)).toEqual({
      ok: true,
    });
    expect(await cancelInvite(world.db, actorOf(world.owner), invite.id, NOW + 5)).toEqual({
      ok: true,
    });
    expect((await row(invite.id))?.revoked_at).toEqual(new Date(NOW));
    await invited("dan@x.test");
    const { rows } = await world.db.query(
      "SELECT action FROM audit_log WHERE action = 'member.invite_cancelled'",
    );
    expect(rows).toHaveLength(1);
    const token = invite.link.split("/").at(-1) ?? "";
    const joined = await acceptInvite(
      world.db,
      token,
      { account: { name: "Cleo", password: "a long enough password" } },
      NOW,
      discardLog(),
    );
    expect(joined).toEqual({ ok: false, reason: "cancelled" });
  });

  it("answers accepted for a used invite and not-found for another workspace's", async () => {
    const invite = await invited("cleo@x.test");
    await acceptInvite(
      world.db,
      invite.link.split("/").at(-1) ?? "",
      { account: { name: "Cleo", password: "a long enough password" } },
      NOW,
      discardLog(),
    );
    expect(await cancelInvite(world.db, actorOf(world.owner), invite.id, NOW)).toEqual({
      ok: false,
      reason: "accepted",
    });
    const other = { userId: world.other.owner.user.id, workspaceId: world.other.workspaceId };
    expect(await cancelInvite(world.db, other, invite.id, NOW)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});
