import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { insertUser, NOW, PASSWORD } from "@/test/accounts-fixture";
import { addMember, membersWorld, removeMember } from "@/test/members-fixture";
import { migratedPglite } from "@/test/pglite";
import { insertSession, readSession } from "@/test/sessions-fixture";
import type { Database } from "../db/database";
import { hashSecret } from "../share/tokens";
import { authFor } from "./better-auth";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./field-rules";
import { logIn } from "./login";
import {
  completePasswordReset,
  createResetLink,
  isResetTokenUsable,
  MAX_RESETS_PER_HOUR,
  requestPasswordReset,
  RESET_TTL_MS,
  type ResetEmail,
} from "./password-reset";

const ORIGIN = new URL("https://squint.test");
const NEW_PASSWORD = "a brand new password";
const IP = "203.0.113.9";

// Better Auth checks a link's hour against the clock: the clock reads `NOW`.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

/** Requests a reset at `now` and returns the emails sent. */
async function request(db: Database, email: string, now = NOW): Promise<ResetEmail[]> {
  const sent: ResetEmail[] = [];
  await requestPasswordReset(db, email, {
    now,
    origin: ORIGIN,
    send: (message) => {
      sent.push(message);
      return Promise.resolve();
    },
  });
  return sent;
}

function tokenOf(email: { link: string } | null | undefined): string {
  const token = email?.link.split("/reset/")[1];
  if (!token) throw new Error("no link");
  return token;
}

async function signsInWith(db: Database, email: string, password: string, now: number) {
  return (await logIn(db, { email, password, ip: IP }, now)).ok;
}

describe("password reset", () => {
  it("emails a one-hour link to the account, storing only its hash", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, "ana@acme.test");
    const [email] = await request(db, " ANA@acme.test ");
    expect(email?.to).toBe("ana@acme.test");
    expect(email?.link).toMatch(/^https:\/\/squint\.test\/reset\/[A-Za-z0-9_-]{43}$/);
    const token = tokenOf(email);
    const { rows } = await db.query("SELECT identifier, value, by_admin FROM verifications");
    expect(rows).toEqual([
      { identifier: `sha256:reset-password:${hashSecret(token)}`, value: userId, by_admin: false },
    ]);
    expect(await isResetTokenUsable(db, token, NOW + RESET_TTL_MS - 1)).toBe(true);
    expect(await isResetTokenUsable(db, token, NOW + RESET_TTL_MS)).toBe(false);
  });

  it("sends nothing for unknown or deleted accounts", async () => {
    const db = await migratedPglite();
    await insertUser(db, "gone@acme.test");
    await db.query("UPDATE users SET deleted_at = now()");
    expect(await request(db, "nobody@acme.test")).toEqual([]);
    expect(await request(db, "gone@acme.test")).toEqual([]);
  });

  it("sends nothing to an account removed from its workspace, as for any deleted one", async () => {
    const world = await membersWorld();
    const ben = await addMember(world.db, world.workspaceId, undefined, "ben@acme.test");
    await removeMember(world.db, ben.user.id, world.workspaceId, NOW);
    expect(await request(world.db, "ben@acme.test", NOW + 1000)).toEqual([]);
  });

  it("sends at most 3 open links per account; a link's hour ending frees its place", async () => {
    const db = await migratedPglite();
    await insertUser(db, "ana@acme.test");
    for (let index = 0; index < MAX_RESETS_PER_HOUR; index += 1) {
      expect(await request(db, "ana@acme.test", NOW + index)).toHaveLength(1);
    }
    expect(await request(db, "ana@acme.test", NOW + 10)).toEqual([]);
    expect(await request(db, "ana@acme.test", NOW + RESET_TTL_MS + 1)).toHaveLength(1);
  });

  it("stops counting a link once it's used (Better Auth deletes it)", async () => {
    const db = await migratedPglite();
    await insertUser(db, "ana@acme.test");
    const links = [];
    for (let index = 0; index < MAX_RESETS_PER_HOUR; index += 1) {
      links.push(...(await request(db, "ana@acme.test", NOW + index)));
    }
    expect(await completePasswordReset(db, tokenOf(links[0]), NEW_PASSWORD, NOW + 5)).toBe(true);
    // The reset voided the other two as well: three more can go out.
    expect(await request(db, "ana@acme.test", NOW + 6)).toHaveLength(1);
  });

  it("counts only emailed links toward the cap, never the admin's", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, "ana@acme.test");
    for (let index = 0; index < MAX_RESETS_PER_HOUR; index += 1) {
      expect(
        await createResetLink(db, userId, { now: NOW + index, origin: ORIGIN }),
      ).not.toBeNull();
    }
    // Three admin links in the hour: the owner's own requests still go out, up to the cap.
    for (let index = 0; index < MAX_RESETS_PER_HOUR; index += 1) {
      expect(await request(db, "ana@acme.test", NOW + 10 + index)).toHaveLength(1);
    }
    expect(await request(db, "ana@acme.test", NOW + 20)).toEqual([]);
    // And the admin can still make one past it.
    expect(await createResetLink(db, userId, { now: NOW + 30, origin: ORIGIN })).not.toBeNull();
  });

  it("keeps only the newest admin link working, and the emailed ones too", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, "ana@acme.test");
    const first = tokenOf(await createResetLink(db, userId, { now: NOW, origin: ORIGIN }));
    const emailed = tokenOf((await request(db, "ana@acme.test", NOW + 1))[0]);
    const second = tokenOf(await createResetLink(db, userId, { now: NOW + 2, origin: ORIGIN }));
    expect(await isResetTokenUsable(db, first, NOW + 3)).toBe(false);
    expect(await isResetTokenUsable(db, second, NOW + 3)).toBe(true);
    expect(await isResetTokenUsable(db, emailed, NOW + 3)).toBe(true);
    expect(await completePasswordReset(db, first, NEW_PASSWORD, NOW + 3)).toBe(false);
    expect(await completePasswordReset(db, second, NEW_PASSWORD, NOW + 3)).toBe(true);
    expect(await signsInWith(db, "ana@acme.test", NEW_PASSWORD, NOW + 4)).toBe(true);
  });

  it("makes no admin link for a deleted account", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, "ana@acme.test");
    await db.query("UPDATE users SET deleted_at = now()");
    expect(await createResetLink(db, userId, { now: NOW, origin: ORIGIN })).toBeNull();
    const { rows } = await db.query("SELECT 1 FROM verifications");
    expect(rows).toEqual([]);
  });

  it("sets the password once, ends every session, spends the other links and email changes", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, "ana@acme.test");
    const session = await insertSession(db, userId, NOW);
    await db.query(
      `INSERT INTO email_changes (user_id, new_email, token_hash, expires_at)
       VALUES ($1, 'ana@new.test', $2, $3)`,
      [userId, "c".repeat(64), new Date(NOW + RESET_TTL_MS)],
    );
    const [first] = await request(db, "ana@acme.test");
    const [second] = await request(db, "ana@acme.test");

    expect(await completePasswordReset(db, tokenOf(first), NEW_PASSWORD, NOW + 1)).toBe(true);
    expect(await completePasswordReset(db, tokenOf(first), "another password!", NOW + 2)).toBe(
      false,
    );
    expect(await isResetTokenUsable(db, tokenOf(second), NOW + 2)).toBe(false);
    expect(await completePasswordReset(db, tokenOf(second), "another password!", NOW + 2)).toBe(
      false,
    );
    expect(await readSession(db, session, NOW + 2)).toBeNull();
    const { rows: links } = await db.query("SELECT 1 FROM verifications");
    expect(links).toEqual([]);
    const { rows: changes } = await db.query("SELECT 1 FROM email_changes WHERE used_at IS NULL");
    expect(changes).toEqual([]);

    expect(await signsInWith(db, "ana@acme.test", PASSWORD, NOW + 3)).toBe(false);
    expect(await signsInWith(db, "ana@acme.test", NEW_PASSWORD, NOW + 4)).toBe(true);
    const { rows } = await db.query<Record<string, unknown>>(
      "SELECT actor_user_id, action, target_type, target_id, meta FROM audit_log ORDER BY id",
    );
    expect(rows).toEqual([
      {
        actor_user_id: userId,
        action: "user.password_reset",
        target_type: "user",
        target_id: userId,
        meta: {},
      },
      expect.objectContaining({ action: "user.signed_in" }) as unknown,
    ]);
  });

  it("refuses expired and made-up links", async () => {
    const db = await migratedPglite();
    await insertUser(db, "ana@acme.test");
    const [email] = await request(db, "ana@acme.test");
    expect(await completePasswordReset(db, tokenOf(email), NEW_PASSWORD, NOW + RESET_TTL_MS)).toBe(
      false,
    );
    expect(await completePasswordReset(db, "x".repeat(43), NEW_PASSWORD, NOW)).toBe(false);
    expect(await completePasswordReset(db, "../etc", NEW_PASSWORD, NOW)).toBe(false);
  });

  it("refuses a link once its user is deleted", async () => {
    const db = await migratedPglite();
    await insertUser(db, "ana@acme.test");
    const [email] = await request(db, "ana@acme.test");
    await db.query("UPDATE users SET deleted_at = now()");
    expect(await isResetTokenUsable(db, tokenOf(email), NOW)).toBe(false);
    expect(await completePasswordReset(db, tokenOf(email), NEW_PASSWORD, NOW)).toBe(false);
  });

  it("never takes what's stored as the link, not even through Better Auth directly", async () => {
    const db = await migratedPglite();
    await insertUser(db, "ana@acme.test");
    const token = tokenOf((await request(db, "ana@acme.test"))[0]);
    const { rows } = await db.query<{ identifier: string }>("SELECT identifier FROM verifications");
    const stored = rows[0]?.identifier ?? "";
    for (const forged of [
      stored,
      stored.replace(/^sha256:reset-password:/, ""),
      hashSecret(token),
    ]) {
      expect(await completePasswordReset(db, forged, NEW_PASSWORD, NOW)).toBe(false);
      await expect(
        authFor(db).api.resetPassword({ body: { token: forged, newPassword: NEW_PASSWORD } }),
      ).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });
    }
    expect(await isResetTokenUsable(db, token, NOW)).toBe(true);
  });

  it("works for every email Squint accepts, whatever Better Auth's own check says", async () => {
    const db = await migratedPglite();
    for (const address of ["jürgen@firma.de", "ops&billing@acme.com", "a@b.c"]) {
      await insertUser(db, address);
      const [email] = await request(db, address);
      expect(email?.to).toBe(address);
      expect(await completePasswordReset(db, tokenOf(email), NEW_PASSWORD, NOW + 1)).toBe(true);
      expect(await signsInWith(db, address, NEW_PASSWORD, NOW + 2)).toBe(true);
    }
  });

  it("takes every password the field rules take, at both ends of their length", async () => {
    const db = await migratedPglite();
    await insertUser(db, "ana@acme.test");
    const passwords = [
      "p".repeat(PASSWORD_MIN_LENGTH),
      "p".repeat(PASSWORD_MAX_LENGTH),
      // Counted in UTF-16 units by both: 6 keys are 12.
      "\u{1F511}".repeat(PASSWORD_MIN_LENGTH / 2),
    ];
    for (const [index, password] of passwords.entries()) {
      const [email] = await request(db, "ana@acme.test", NOW + index);
      expect(await completePasswordReset(db, tokenOf(email), password, NOW + index)).toBe(true);
      expect(await signsInWith(db, "ana@acme.test", password, NOW + index)).toBe(true);
    }
  });
});
