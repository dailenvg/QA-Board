import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOW, PASSWORD } from "@/test/accounts-fixture";
import { discardLog, inviteOne, membersWorld, type MembersWorld } from "@/test/members-fixture";
import { migratedPglite } from "@/test/pglite";
import { changePassword } from "../account/password-change";
import { logOutEverywhere } from "../account/log-out-everywhere";
import { createOwnerResetLink } from "../admin/workspace-actions";
import type { Database } from "../db/database";
import { acceptInvite } from "../workspace/members/accept";
import { authSecret } from "./auth-secret";
import { authFor, endSession } from "./better-auth";
import { logIn } from "./login";
import { completePasswordReset, requestPasswordReset, type ResetEmail } from "./password-reset";
import { authCookieHeader } from "./session-token";

/**
 * Better Auth's transactions hold one connection of the pool until they end.
 * Anything run inside one (a hook, such as the sign-in hold) that queries the
 * pool instead waits on a second connection: with enough of those at once
 * the pool runs dry, and on PGlite's single connection it never returns.
 * These run every flow that goes through Better Auth on a database that
 * refuses, and records, any query made outside an open transaction.
 */

const ORIGIN = new URL("https://squint.test");
const IP = "203.0.113.9";
const NEW_PASSWORD = "a brand new password";

interface Guarded extends Database {
  /** The queries made on the pool while a transaction was open. */
  strays: string[];
}

/** `db`, refusing (and recording) any query on it while one of its transactions is open. */
function poolGuarded(db: Database): Guarded {
  let open = 0;
  const strays: string[] = [];
  return {
    strays,
    query(sql, parameters) {
      if (open > 0) {
        strays.push(sql);
        return Promise.reject(new Error("queried the pool inside an open transaction"));
      }
      return db.query(sql, parameters);
    },
    async transaction(run) {
      open += 1;
      try {
        return await db.transaction(run);
      } finally {
        open -= 1;
      }
    },
  };
}

// Better Auth checks a reset link's hour against the clock: the clock reads `NOW`.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

async function guardedWorld(): Promise<{ db: Guarded; world: MembersWorld }> {
  const db = poolGuarded(await migratedPglite());
  return { db, world: await membersWorld(db) };
}

async function emailedLink(db: Database, email: string): Promise<string> {
  const sent: ResetEmail[] = [];
  await requestPasswordReset(db, email, {
    now: NOW,
    origin: ORIGIN,
    send: (message) => {
      sent.push(message);
      return Promise.resolve();
    },
  });
  return sent[0]?.link.split("/reset/")[1] ?? "";
}

describe("Better Auth's transactions and the pool", () => {
  it("are never queried around: sign-in, resets, password change, log out, accept", async () => {
    const { db, world } = await guardedWorld();
    const { email, id } = world.owner.user;

    const signedIn = await logIn(db, { email, password: PASSWORD, ip: IP }, NOW);
    expect(signedIn).toMatchObject({ ok: true });

    const emailed = await emailedLink(db, email);
    expect(await completePasswordReset(db, emailed, NEW_PASSWORD, NOW)).toBe(true);
    const admin = await createOwnerResetLink(
      db,
      { adminId: world.other.owner.user.id, workspaceId: world.workspaceId },
      { now: NOW, origin: ORIGIN },
    );
    const adminToken = admin.ok ? (admin.link.split("/reset/")[1] ?? "") : "";
    expect(await completePasswordReset(db, adminToken, PASSWORD, NOW)).toBe(true);

    const changed = await changePassword(
      db,
      world.owner.user,
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, ip: IP },
      NOW,
    );
    expect(changed).toMatchObject({ ok: true });
    await endSession(db, authCookieHeader(changed.ok ? changed.token : "", authSecret()) ?? "");
    await logOutEverywhere(db, id, NOW);

    const token = await inviteOne(world, world.owner, "cleo@x.test", NOW);
    const joined = await acceptInvite(
      db,
      token,
      { account: { name: "Cleo Diaz", password: NEW_PASSWORD } },
      NOW,
      discardLog(),
    );
    expect(joined).toMatchObject({ ok: true, sessionToken: expect.any(String) as unknown });

    expect(db.strays).toEqual([]);
  });

  it("would be caught querying around: Better Auth's changePassword starts a session inside one", async () => {
    const { db, world } = await guardedWorld();
    const cookie = authCookieHeader(world.owner.cookie.split("=")[1], authSecret()) ?? "";
    await expect(
      authFor(db).api.changePassword({
        headers: new Headers({ cookie }),
        body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, revokeOtherSessions: true },
      }),
    ).rejects.toThrow();
    expect(db.strays.some((sql) => /memberships/i.test(sql))).toBe(true);
  });
});
