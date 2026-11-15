import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PASSWORD } from "@/test/accounts-fixture";
import {
  addMember,
  deps,
  discardLog,
  inviteOne,
  membersWorld,
  person,
  WORKSPACE,
  type MembersWorld,
} from "@/test/members-fixture";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import { scheduleAccountDeletion } from "../../account/account-deletion";
import type { Database } from "../../db/database";
import { migrate } from "../../share/migrate";
import { acceptInvite, type Joiner } from "./accept";
import { cancelInvite } from "./cancel-invite";
import { createInvites } from "./create-invites";
import { resendInvite } from "./resend-invite";
import { seatsUsed } from "./seats";

/**
 * The members lock order (L1 to L5) under real concurrency. PGlite runs one
 * transaction at a time, so this needs a real Postgres: set TEST_DATABASE_URL
 * to a throwaway local one (127.0.0.1 or localhost only). Skipped otherwise.
 * Runs in a schema of its own, dropped after.
 */

let pool: Pool;
let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  if (!TEST_DATABASE_URL) return;
  const fresh = await freshSchema(TEST_DATABASE_URL, 16);
  ({ pool, db } = fresh);
  close = () => fresh.close();
  await migrate(db);
});

afterAll(async () => {
  await close?.();
});

const NEW_PERSON: Joiner = { account: { name: "Cleo", password: "a long enough password" } };
const now = () => Date.now();

const asActor = (world: MembersWorld, userId = world.owner.user.id) => ({
  userId,
  workspaceId: world.workspaceId,
});

/** Holds the workspace's members lock (L1) in a transaction of its own until `release`. */
async function holdMembersLock(workspaceId: string) {
  const client = await pool.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `squint:members:${workspaceId}`,
  ]);
  return {
    query: (text: string, values?: unknown[]) => client.query(text, values),
    async release() {
      await client.query("COMMIT");
      client.release();
    },
  };
}

/** Long enough for the others to reach the lock and wait on it. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

describe.skipIf(!TEST_DATABASE_URL)("members on Postgres, in parallel", () => {
  it("stops parallel invite batches at the seat limit", async () => {
    const world = await membersWorld(db);
    const outcomes = await Promise.all(
      Array.from({ length: 6 }, (_, batch) =>
        createInvites(
          db,
          asActor(world),
          [0, 1, 2].map((n) => `b${batch}-${n}@x.test`),
          now(),
          deps(),
        ),
      ),
    );
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(3);
    expect(
      outcomes.filter((outcome) => !outcome.ok && outcome.reason === "seats-full"),
    ).toHaveLength(3);
    expect(await seatsUsed(db, world.workspaceId, now())).toBe(10);
  });

  it("serialises accepting and resending the same invite: no deadlock, one order wins", async () => {
    for (let round = 0; round < 5; round += 1) {
      const world = await membersWorld(db);
      const email = `round-${round}@x.test`;
      const token = await inviteOne(world, world.owner, email, now());
      const { rows } = await db.query<{ id: string }>(
        "SELECT id FROM workspace_invites WHERE email = $1",
        [email],
      );
      const [joined, resent] = await Promise.all([
        acceptInvite(db, token, NEW_PERSON, now(), discardLog()),
        resendInvite(db, asActor(world), rows[0]?.id ?? "", now(), deps()),
      ]);
      expect(joined).toMatchObject({ ok: true });
      expect([true, false]).toContain(resent.ok);
      if (!resent.ok) expect(resent).toEqual({ ok: false, reason: "not-found" });
    }
  });

  it("serialises an accept with the owner's deletion: exactly one wins", async () => {
    const wins = { accept: 0, deletion: 0 };
    for (let round = 0; round < 6; round += 1) {
      const world = await membersWorld(db);
      const token = await inviteOne(world, world.owner, `race-${round}@x.test`, now());
      const request = {
        confirmText: WORKSPACE,
        currentPassword: PASSWORD,
        ip: `203.0.113.${round}`,
      };
      const [joined, deleted] = await Promise.all([
        acceptInvite(db, token, NEW_PERSON, now(), discardLog()),
        scheduleAccountDeletion(db, world.owner.user, request, now()),
      ]);
      if (joined.ok) {
        wins.accept += 1;
        expect(deleted).toEqual({ ok: false, reason: "owner-has-members" });
      } else {
        wins.deletion += 1;
        expect(joined).toEqual({ ok: false, reason: "not-found" });
        expect(deleted).toMatchObject({ ok: true });
        const { rows } = await db.query(
          "SELECT revoked_at IS NOT NULL AS revoked FROM workspace_invites WHERE workspace_id = $1",
          [world.workspaceId],
        );
        expect(rows).toEqual([{ revoked: true }]);
      }
    }
    expect(wins.accept + wins.deletion).toBe(6);
  });

  it("lets one signed-in person accept invites to two workspaces at once into one only", async () => {
    const a = await membersWorld(db);
    const cleo = await person(db);
    const tokens = [
      await inviteOne(a, a.owner, cleo.user.email, now()),
      await inviteOne(
        { db, workspaceId: a.other.workspaceId },
        a.other.owner,
        cleo.user.email,
        now(),
      ),
    ];
    const results = await Promise.all(
      tokens.map((token) => acceptInvite(db, token, { session: cleo.user }, now(), discardLog())),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, reason: "in-another-workspace" },
    ]);
    const { rows } = await db.query("SELECT 1 FROM memberships WHERE user_id = $1", [cleo.user.id]);
    expect(rows).toHaveLength(1);
  });

  it("makes one account when two new-person accepts race on one address: the other must sign in", async () => {
    const a = await membersWorld(db);
    const email = `twice-${Date.now()}@x.test`;
    const tokens = [
      await inviteOne(a, a.owner, email, now()),
      await inviteOne({ db, workspaceId: a.other.workspaceId }, a.other.owner, email, now()),
    ];
    const results = await Promise.all(
      tokens.map((token) => acceptInvite(db, token, NEW_PERSON, now(), discardLog())),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, reason: "sign-in-first" },
    ]);
    const { rows } = await db.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    expect(rows).toHaveLength(1);
    const { rows: memberships } = await db.query("SELECT 1 FROM memberships WHERE user_id = $1", [
      rows[0]?.id,
    ]);
    expect(memberships).toHaveLength(1);
  });

  it("binds a manager waiting on the lock to the people switch the owner just turned off", async () => {
    const world = await membersWorld(db);
    const manager = await addMember(db, world.workspaceId, ["review_links", "people"]);
    await inviteOne(world, world.owner, "open@x.test", now());
    const { rows } = await db.query<{ id: string; expires_at: Date }>(
      "SELECT id, expires_at FROM workspace_invites WHERE workspace_id = $1",
      [world.workspaceId],
    );
    const open = rows[0];
    // The owner's switch change, as PR 3's PATCH takes it: L1, then the update.
    const change = await holdMembersLock(world.workspaceId);
    await change.query(
      "UPDATE memberships SET permissions = ARRAY['review_links'] WHERE user_id = $1",
      [manager.user.id],
    );
    const actor = asActor(world, manager.user.id);
    const waiting = Promise.all([
      createInvites(db, actor, ["new@x.test"], now(), deps()),
      resendInvite(db, actor, open?.id ?? "", now(), deps()),
      cancelInvite(db, actor, open?.id ?? "", now()),
    ]);
    await settle();
    await change.release();
    expect(await waiting).toEqual([
      { ok: false, reason: "not-allowed" },
      { ok: false, reason: "not-allowed" },
      { ok: false, reason: "not-allowed" },
    ]);
    const { rows: after } = await db.query(
      "SELECT email, expires_at, revoked_at FROM workspace_invites WHERE workspace_id = $1",
      [world.workspaceId],
    );
    expect(after).toEqual([
      { email: "open@x.test", expires_at: open?.expires_at, revoked_at: null },
    ]);
  });

  it("lets a manager's invite that took the lock first stand, and the switch change follow", async () => {
    const world = await membersWorld(db);
    const manager = await addMember(db, world.workspaceId, ["review_links", "people"]);
    const actor = asActor(world, manager.user.id);
    const results = await Promise.all([
      createInvites(db, actor, ["first@x.test"], now(), deps()),
      (async () => {
        await settle();
        const change = await holdMembersLock(world.workspaceId);
        await change.query(
          "UPDATE memberships SET permissions = ARRAY['review_links'] WHERE user_id = $1",
          [manager.user.id],
        );
        await change.release();
      })(),
    ]);
    expect(results[0]).toMatchObject({ ok: true });
    expect(await createInvites(db, actor, ["second@x.test"], now(), deps())).toEqual({
      ok: false,
      reason: "not-allowed",
    });
  });
});
