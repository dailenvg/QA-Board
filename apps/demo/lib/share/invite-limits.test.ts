import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seat } from "@/test/workspace-fixture";
import { migratedPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { migrate } from "./migrate";
import {
  claimInviteSends,
  INVITE_WINDOW_MS,
  MAX_INVITES_PER_MEMBER,
  MAX_INVITES_PER_WORKSPACE,
  pruneInviteSends,
  type InviteSender,
} from "./invite-limits";

const NOW = Date.UTC(2026, 10, 12, 9);
const MINUTE = 60_000;

async function rowCount(db: Database): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM squint_share_invite_sends",
  );
  return rows[0]?.count ?? 0;
}

/** A second member of `workspaceId`. */
async function member(db: Database, workspaceId: string, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'company') RETURNING id",
    [email],
  );
  const userId = rows[0]?.id ?? "";
  await db.query(
    "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'member')",
    [userId, workspaceId],
  );
  return userId;
}

describe("invitation email limits", () => {
  let db: Database;
  let owner: InviteSender;

  beforeEach(async () => {
    db = await migratedPglite();
    const { workspaceId, userId } = await seat(db, "acme");
    owner = { workspaceId, userId };
  });

  it("let a member send 20 an hour, then say when the next ones fit", async () => {
    expect(MAX_INVITES_PER_MEMBER).toBe(20);
    expect(await claimInviteSends(db, owner, 10, NOW)).toEqual({ ok: true });
    expect(await claimInviteSends(db, owner, 8, NOW + 10 * MINUTE)).toEqual({ ok: true });
    // 18 sent: 3 more would be 21, so the first batch must age out first.
    expect(await claimInviteSends(db, owner, 3, NOW + 20 * MINUTE)).toEqual({
      ok: false,
      retryAfterSeconds: 40 * 60,
    });
    // Refused sends aren't recorded: 2 still fit.
    expect(await rowCount(db)).toBe(18);
    expect(await claimInviteSends(db, owner, 2, NOW + 20 * MINUTE)).toEqual({ ok: true });
    // Once the first 10 are an hour old, there's room again.
    expect(await claimInviteSends(db, owner, 10, NOW + INVITE_WINDOW_MS + 1)).toEqual({ ok: true });
  });

  it("let a workspace send 30 an hour across its members", async () => {
    expect(MAX_INVITES_PER_WORKSPACE).toBe(30);
    const ben = {
      workspaceId: owner.workspaceId,
      userId: await member(db, owner.workspaceId, "ben@acme.test"),
    };
    const cleo = {
      workspaceId: owner.workspaceId,
      userId: await member(db, owner.workspaceId, "cleo@acme.test"),
    };
    expect(await claimInviteSends(db, owner, 10, NOW)).toEqual({ ok: true });
    expect(await claimInviteSends(db, ben, 10, NOW + MINUTE)).toEqual({ ok: true });
    expect(await claimInviteSends(db, cleo, 10, NOW + 2 * MINUTE)).toEqual({ ok: true });
    // Cleo has sent only 10 herself, but the workspace is at 30.
    expect(await claimInviteSends(db, cleo, 1, NOW + 3 * MINUTE)).toEqual({
      ok: false,
      retryAfterSeconds: 57 * 60,
    });
  });

  it("count each workspace on its own", async () => {
    const other = await seat(db, "bravo");
    expect(await claimInviteSends(db, owner, 10, NOW)).toEqual({ ok: true });
    expect(await claimInviteSends(db, owner, 10, NOW)).toEqual({ ok: true });
    expect(await claimInviteSends(db, other, 10, NOW)).toEqual({ ok: true });
  });

  it("refuse a send bigger than the limit outright", async () => {
    expect(await claimInviteSends(db, owner, MAX_INVITES_PER_MEMBER + 1, NOW)).toEqual({
      ok: false,
      retryAfterSeconds: 60 * 60,
    });
  });

  it("prune sends a day old, keeping newer ones", async () => {
    const day = 24 * 60 * MINUTE;
    await claimInviteSends(db, owner, 2, NOW - day - 1);
    await claimInviteSends(db, owner, 1, NOW);
    expect(await pruneInviteSends(db, NOW)).toBe(2);
    expect(await rowCount(db)).toBe(1);
    expect(await pruneInviteSends(db, NOW)).toBe(0);
  });

  it("keep no address, only who sent and when", async () => {
    await claimInviteSends(db, owner, 1, NOW);
    const { rows } = await db.query("SELECT * FROM squint_share_invite_sends");
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["at", "id", "user_id", "workspace_id"]);
  });
});

/**
 * The limits under real parallel sends: PGlite runs one transaction at a
 * time, so this needs a Postgres of its own in TEST_DATABASE_URL; skipped without it.
 */
describe.skipIf(!TEST_DATABASE_URL)("invitation email limits in parallel", () => {
  let fresh: Awaited<ReturnType<typeof freshSchema>>;
  let owner: InviteSender;

  beforeAll(async () => {
    fresh = await freshSchema(TEST_DATABASE_URL as string, 12);
    await migrate(fresh.db);
    const { workspaceId, userId } = await seat(fresh.db, "parallel");
    owner = { workspaceId, userId };
  });

  afterAll(async () => {
    await fresh.close();
  });

  it("lets exactly 4 of 12 parallel sends of 5 through for one member (20)", async () => {
    const claims = await Promise.all(
      Array.from({ length: 12 }, () => claimInviteSends(fresh.db, owner, 5, NOW)),
    );
    expect(claims.filter((claim) => claim.ok)).toHaveLength(4);
    expect(await rowCount(fresh.db)).toBe(20);
  });
});
