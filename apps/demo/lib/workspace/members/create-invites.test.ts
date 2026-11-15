import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOW } from "@/test/accounts-fixture";
import {
  addMember,
  deps,
  EMAIL_OFF,
  EMAIL_ON,
  membersWorld,
  person,
  PREVIEW,
  removeMember,
  SITE,
  tokenOf,
  type MembersWorld,
  type Person,
} from "@/test/members-fixture";
import { hashSecret } from "../../share/tokens";
import { toDate } from "../times";
import { createInvites, readAddresses } from "./create-invites";
import { INVITE_EMAIL_WINDOW_MS, MAX_INVITE_EMAILS } from "./invite-sends";
import { INVITE_TTL_MS } from "./invites";

let world: MembersWorld;

beforeEach(async () => {
  world = await membersWorld();
});

const invite = (
  emails: string[],
  { actor = world.owner, env = EMAIL_OFF, now = NOW, fail = false } = {},
) => {
  const options = deps(env, fail);
  const made = createInvites(
    world.db,
    { userId: actor.user.id, workspaceId: world.workspaceId },
    emails,
    now,
    options,
  );
  return made.then((outcome) => ({ outcome, batches: options.batches }));
};

async function inviteRows() {
  const { rows } = await world.db.query<{
    email: string;
    permissions: string[];
    send_count: number;
    last_sent_at: Date | null;
    last_send_error_at: Date | null;
    expires_at: Date;
    invited_by: string;
  }>(
    `SELECT email, permissions, send_count, last_sent_at, last_send_error_at, expires_at,
       invited_by
     FROM workspace_invites ORDER BY created_at, email`,
  );
  return rows;
}

async function sends(): Promise<number> {
  const { rows } = await world.db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM workspace_invite_sends",
  );
  return rows[0]?.count ?? 0;
}

/** Fills the workspace up to `used` seats with members. */
async function fill(used: number): Promise<Person[]> {
  const members: Person[] = [];
  for (let seat = 1; seat < used; seat += 1)
    members.push(await addMember(world.db, world.workspaceId));
  return members;
}

describe("readAddresses", () => {
  it("normalises, keeps the order, folds duplicates, and marks what isn't an email", () => {
    expect(readAddresses([" Cleo@X.test", "cleo@x.test", "nope", " nope ", "dan@x.test"])).toEqual([
      { email: "cleo@x.test", valid: true },
      { email: "nope", valid: false },
      { email: "dan@x.test", valid: true },
    ]);
  });
});

describe("createInvites: one address at a time", () => {
  it("invites a new address for 7 days, with a link that opens by its hash", async () => {
    const { outcome } = await invite(["Cleo@Client.test"]);
    expect(outcome).toEqual({
      ok: true,
      results: [
        {
          email: "cleo@client.test",
          ok: true,
          invite: {
            id: expect.any(String) as unknown,
            link: expect.stringMatching(new RegExp(`^${SITE}/join/[A-Za-z0-9_-]{43}$`)) as unknown,
            expiresAt: NOW + INVITE_TTL_MS,
          },
          emailed: false,
        },
      ],
      seats: { used: 2, limit: 10 },
    });
    const token = tokenOf(outcome.ok ? outcome.results[0] : undefined);
    const { rows } = await world.db.query(
      "SELECT email, invited_by FROM workspace_invites WHERE token_hash = $1",
      [hashSecret(token)],
    );
    expect(rows).toEqual([{ email: "cleo@client.test", invited_by: world.owner.user.id }]);
  });

  it("answers every rule of section 2 on its own address, and invites the rest", async () => {
    const active = await addMember(world.db, world.workspaceId);
    const leaving = await addMember(world.db, world.workspaceId);
    await world.db.query("UPDATE users SET deleted_at = $2, delete_after = $3 WHERE id = $1", [
      leaving.user.id,
      toDate(NOW),
      toDate(NOW + 30 * 24 * 3600 * 1000),
    ]);
    const elsewhere = await addMember(world.db, world.other.workspaceId);
    const admin = await person(world.db);
    await world.db.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
    const removedElsewhere = await addMember(world.db, world.other.workspaceId);
    await removeMember(world.db, removedElsewhere.user.id, world.other.workspaceId, NOW);
    await invite(["open@x.test"]);

    const { outcome } = await invite([
      active.user.email,
      leaving.user.email,
      elsewhere.user.email,
      world.other.owner.user.email,
      admin.user.email,
      removedElsewhere.user.email,
      "open@x.test",
      "not an email",
      "new@x.test",
    ]);
    if (!outcome.ok) throw new Error("refused");
    expect(outcome.results.map((result) => [result.email, result.ok || result.error])).toEqual([
      [active.user.email, "already-member"],
      [leaving.user.email, true],
      [elsewhere.user.email, "in-another-workspace"],
      [world.other.owner.user.email, "in-another-workspace"],
      [admin.user.email, "cannot-invite"],
      [removedElsewhere.user.email, true],
      ["open@x.test", "already-invited"],
      ["not an email", "invalid"],
      ["new@x.test", true],
    ]);
    // Owner, the active member, the first invite and the three new ones.
    expect(outcome.seats).toEqual({ used: 6, limit: 10 });
  });

  it("refuses an address with a membership elsewhere even once its owner deleted the account", async () => {
    await world.db.query(
      "UPDATE users SET deleted_at = now(), delete_after = now() WHERE id = $1",
      [world.other.owner.user.id],
    );
    const { outcome } = await invite([world.other.owner.user.email]);
    expect(outcome.ok && outcome.results[0]).toMatchObject({
      ok: false,
      error: "in-another-workspace",
    });
  });

  it("renews an open invite that expired: the same link, 7 more days, a seat again", async () => {
    const first = await invite(["cleo@x.test"]);
    const link =
      first.outcome.ok && first.outcome.results[0]?.ok && first.outcome.results[0].invite.link;
    const later = NOW + INVITE_TTL_MS + 1000;
    const { outcome } = await invite(["cleo@x.test"], { now: later });
    expect(outcome).toMatchObject({
      ok: true,
      results: [{ ok: true, invite: { link, expiresAt: later + INVITE_TTL_MS } }],
      seats: { used: 2, limit: 10 },
    });
    expect(await inviteRows()).toHaveLength(1);
    const { rows } = await world.db.query<{ action: string; meta: unknown }>(
      "SELECT action, meta FROM audit_log WHERE action = 'member.invited' ORDER BY id",
    );
    expect(rows).toEqual([
      { action: "member.invited", meta: { fields: ["invite"] } },
      { action: "member.invited", meta: { fields: ["expires_at"] } },
    ]);
  });

  it("never records an address in the audit log", async () => {
    await invite(["cleo@x.test"]);
    const { rows } = await world.db.query<{ log: string }>(
      "SELECT string_agg(target_id || meta::text, ' ') AS log FROM audit_log",
    );
    expect(rows[0]?.log).not.toContain("cleo");
  });
});

describe("createInvites: the whole request", () => {
  it("refuses, writing nothing, when those that pass need more seats than are left", async () => {
    await fill(8);
    const { outcome } = await invite(["a@x.test", "b@x.test", "c@x.test"]);
    expect(outcome).toEqual({ ok: false, reason: "seats-full", seats: { used: 8, limit: 10 } });
    expect(await inviteRows()).toEqual([]);
  });

  it("counts only the addresses that pass against the seats left", async () => {
    const members = await fill(8);
    const { outcome } = await invite([members[0]?.user.email ?? "", "a@x.test", "b@x.test"]);
    expect(outcome).toMatchObject({ ok: true, seats: { used: 10, limit: 10 } });
  });

  it("frees the seat of an invite that expired, and holds it again on renewal", async () => {
    await fill(9);
    await invite(["cleo@x.test"]);
    const later = NOW + INVITE_TTL_MS + 1000;
    expect((await invite(["dan@x.test"])).outcome).toMatchObject({ reason: "seats-full" });
    expect((await invite(["dan@x.test"], { now: later })).outcome).toMatchObject({ ok: true });
    expect((await invite(["cleo@x.test"], { now: later })).outcome).toMatchObject({
      reason: "seats-full",
      seats: { used: 10, limit: 10 },
    });
  });

  it("doesn't count members who deleted their own account, and lets a lowered limit bite", async () => {
    const leaving = await addMember(world.db, world.workspaceId);
    await world.db.query("UPDATE users SET deleted_at = now() WHERE id = $1", [leaving.user.id]);
    await world.db.query("UPDATE workspaces SET seat_limit = 2 WHERE id = $1", [world.workspaceId]);
    expect((await invite(["a@x.test"])).outcome).toMatchObject({
      ok: true,
      seats: { used: 2, limit: 2 },
    });
    await world.db.query("UPDATE workspaces SET seat_limit = 1 WHERE id = $1", [world.workspaceId]);
    expect((await invite(["b@x.test"])).outcome).toEqual({
      ok: false,
      reason: "seats-full",
      seats: { used: 2, limit: 1 },
    });
  });

  it("refuses 404 once the workspace has closed, and not-allowed to a member without people", async () => {
    const member = await addMember(world.db, world.workspaceId);
    expect((await invite(["a@x.test"], { actor: member })).outcome).toEqual({
      ok: false,
      reason: "not-allowed",
    });
    await world.db.query("UPDATE workspaces SET archived_at = now() WHERE id = $1", [
      world.workspaceId,
    ]);
    expect((await invite(["a@x.test"])).outcome).toEqual({ ok: false, reason: "not-found" });
    expect(await inviteRows()).toEqual([]);
  });
});

describe("createInvites: emails", () => {
  it("emails every invite in one batch from the workspace, and records that it went", async () => {
    const { outcome, batches } = await invite(["cleo@x.test", "dan@x.test"], { env: EMAIL_ON });
    expect(outcome.ok && outcome.results.map((result) => result.ok && result.emailed)).toEqual([
      true,
      true,
    ]);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      from: '"Acme Studio via Squint" <noreply@squint.test>',
      brand: { iconUrl: null, color: null },
      invites: [
        { workspace: "Acme Studio", inviter: "Ana Ruiz", email: "cleo@x.test" },
        { workspace: "Acme Studio", inviter: "Ana Ruiz", email: "dan@x.test" },
      ],
    });
    expect(batches[0]?.invites[0]?.link).toBe(
      outcome.ok && outcome.results[0]?.ok && outcome.results[0].invite.link,
    );
    expect(await sends()).toBe(2);
    expect(await inviteRows()).toMatchObject([
      { send_count: 1, last_sent_at: new Date(NOW), last_send_error_at: null },
      { send_count: 1, last_sent_at: new Date(NOW), last_send_error_at: null },
    ]);
  });

  it("keeps the invites and the claimed sends when Resend refuses, and records that it didn't go", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { outcome } = await invite(["cleo@x.test"], { env: EMAIL_ON, fail: true });
    expect(outcome).toMatchObject({ ok: true, results: [{ ok: true, emailed: false }] });
    expect(await sends()).toBe(1);
    expect(await inviteRows()).toMatchObject([
      { send_count: 0, last_sent_at: null, last_send_error_at: new Date(NOW) },
    ]);
  });

  it("sends and claims nothing with email off or on a preview, and says it didn't go", async () => {
    for (const [env, email] of [
      [EMAIL_OFF, "off@x.test"],
      [PREVIEW, "preview@x.test"],
    ] as const) {
      const { outcome, batches } = await invite([email], { env });
      expect(outcome).toMatchObject({ ok: true, results: [{ ok: true, emailed: false }] });
      expect(batches).toEqual([]);
    }
    expect(await sends()).toBe(0);
    expect(await inviteRows()).toMatchObject([
      { last_sent_at: null, last_send_error_at: new Date(NOW) },
      { last_sent_at: null, last_send_error_at: new Date(NOW) },
    ]);
  });

  it("refuses the whole request, writing nothing, when it needs more emails than the day has left", async () => {
    await world.db.query("UPDATE workspaces SET seat_limit = 100 WHERE id = $1", [
      world.workspaceId,
    ]);
    const first = Array.from({ length: MAX_INVITE_EMAILS - 1 }, (_, i) => `a${i}@x.test`);
    expect((await invite(first, { env: EMAIL_ON })).outcome).toMatchObject({ ok: true });
    const { outcome } = await invite(["late1@x.test", "late2@x.test"], {
      env: EMAIL_ON,
      now: NOW + 1000,
    });
    expect(outcome).toEqual({
      ok: false,
      reason: "rate-limited",
      retryAfterSeconds: INVITE_EMAIL_WINDOW_MS / 1000 - 1,
      sentInWindow: MAX_INVITE_EMAILS - 1,
      limit: MAX_INVITE_EMAILS,
    });
    expect(await inviteRows()).toHaveLength(MAX_INVITE_EMAILS - 1);
    expect(await sends()).toBe(MAX_INVITE_EMAILS - 1);
    expect((await invite(["late1@x.test"], { env: EMAIL_ON })).outcome).toMatchObject({ ok: true });
  });
});

describe("createInvites: what an invite grants (B2)", () => {
  it("grants the defaults for the owner's invites, never people", async () => {
    await invite(["cleo@x.test"]);
    expect(await inviteRows()).toMatchObject([
      { permissions: ["review_links", "trash", "import"] },
    ]);
  });

  it("cuts a member's invite to their own switches, read under the lock", async () => {
    const manager = await addMember(world.db, world.workspaceId, ["review_links", "people"]);
    expect((await invite(["cleo@x.test"], { actor: manager })).outcome).toMatchObject({ ok: true });
    await world.db.query(
      "UPDATE memberships SET permissions = ARRAY['import', 'people'] WHERE user_id = $1",
      [manager.user.id],
    );
    expect((await invite(["dan@x.test"], { actor: manager })).outcome).toMatchObject({ ok: true });
    expect(await inviteRows()).toMatchObject([
      { email: "cleo@x.test", permissions: ["review_links"], invited_by: manager.user.id },
      { email: "dan@x.test", permissions: ["import"], invited_by: manager.user.id },
    ]);
  });
});
