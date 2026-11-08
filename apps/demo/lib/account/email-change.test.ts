import { describe, expect, it } from "vitest";
import { insertUser, NOW } from "@/test/accounts-fixture";
import { migratedPglite } from "@/test/pglite";
import { createSession, readSession } from "../auth/sessions";
import type { Database } from "../db/database";
import {
  confirmEmailChange,
  EMAIL_CHANGE_TTL_MS,
  isEmailChangeUsable,
  MAX_EMAIL_CHANGES_PER_HOUR,
  requestEmailChange,
  type EmailChangeLink,
} from "./email-change";

const ORIGIN = new URL("https://squint.test");

interface Setup {
  db: Database;
  userId: string;
  sent: EmailChangeLink[];
  /** Requests a change to `email` at `now`, delivers it, and returns the link's token. */
  request: (email: string, now?: number) => Promise<string>;
}

async function setup(): Promise<Setup> {
  const db = await migratedPglite();
  const userId = await insertUser(db, "ana@acme.test");
  const sent: EmailChangeLink[] = [];
  const request = async (email: string, now = NOW) => {
    const result = await requestEmailChange(db, userId, email, {
      now,
      origin: ORIGIN,
      send: (link) => {
        sent.push(link);
        return Promise.resolve();
      },
    });
    if (!result.ok) throw new Error(result.reason);
    await result.deliver();
    return sent.at(-1)?.link.split("/email-change/")[1] ?? "";
  };
  return { db, userId, sent, request };
}

async function emailOf(db: Database, userId: string): Promise<string | undefined> {
  const { rows } = await db.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [
    userId,
  ]);
  return rows[0]?.email;
}

describe("requesting an email change", () => {
  it("mails a one-hour link to the new address, storing only the token's hash", async () => {
    const { db, sent, request } = await setup();
    const token = await request("new@acme.test");
    expect(sent).toEqual([
      { to: "new@acme.test", link: `https://squint.test/email-change/${token}` },
    ]);
    const { rows } = await db.query<{ token_hash: string; expires_at: Date }>(
      "SELECT token_hash, expires_at FROM email_changes",
    );
    expect(rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.token_hash).not.toContain(token);
    expect(new Date(rows[0]?.expires_at ?? 0).getTime()).toBe(NOW + EMAIL_CHANGE_TTL_MS);
  });

  it("stores a taken address's request too, so it counts the same, but mails nothing", async () => {
    const { db, userId, sent } = await setup();
    await insertUser(db, "taken@acme.test");
    const result = await requestEmailChange(db, userId, "taken@acme.test", {
      now: NOW,
      origin: ORIGIN,
      send: (link) => {
        sent.push(link);
        return Promise.resolve();
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) await result.deliver();
    expect(sent).toEqual([]);
    expect((await db.query("SELECT 1 FROM email_changes")).rows).toHaveLength(1);
  });

  it(`refuses a request past ${MAX_EMAIL_CHANGES_PER_HOUR} in an hour, then allows one later`, async () => {
    const { db, userId, request } = await setup();
    for (let index = 0; index < MAX_EMAIL_CHANGES_PER_HOUR; index += 1) {
      await request(`new${index}@acme.test`, NOW + index * 60_000);
    }
    const options = { origin: ORIGIN, send: () => Promise.resolve() };
    const capped = await requestEmailChange(db, userId, "four@acme.test", {
      ...options,
      now: NOW + 30 * 60_000,
    });
    expect(capped).toEqual({ ok: false, reason: "rate-limited" });
    // An hour after the first: it has aged out, so there's room for one.
    const later = await requestEmailChange(db, userId, "five@acme.test", {
      ...options,
      now: NOW + EMAIL_CHANGE_TTL_MS + 1,
    });
    expect(later.ok).toBe(true);
  });
});

describe("confirming an email change", () => {
  it("moves the account, ends its sessions, voids its links, and records it without values", async () => {
    const { db, userId, request } = await setup();
    const session = await createSession(db, userId, NOW);
    await db.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, "b".repeat(64), new Date(NOW + 1000)],
    );
    const other = await request("other@acme.test");
    const token = await request("new@acme.test");

    expect(await isEmailChangeUsable(db, token, NOW)).toBe(true);
    expect(await confirmEmailChange(db, token, NOW + 1000)).toEqual({
      ok: true,
      oldEmail: "ana@acme.test",
    });
    expect(await emailOf(db, userId)).toBe("new@acme.test");
    expect(await readSession(db, session, NOW + 1000)).toBeNull();
    const { rows: resets } = await db.query("SELECT 1 FROM password_resets WHERE used_at IS NULL");
    expect(resets).toEqual([]);
    // The other pending link is spent with it.
    expect(await isEmailChangeUsable(db, other, NOW + 1000)).toBe(false);
    expect(await confirmEmailChange(db, other, NOW + 1000)).toEqual({
      ok: false,
      reason: "expired",
    });

    const { rows: audit } = await db.query<{ action: string; meta: unknown }>(
      "SELECT action, meta FROM audit_log ORDER BY id",
    );
    expect(audit.map((entry) => entry.action)).toEqual([
      "user.email_change_requested",
      "user.email_change_requested",
      "user.email_changed",
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/@|[0-9a-f]{64}/);
  });

  it("works once", async () => {
    const { db, userId, request } = await setup();
    const token = await request("new@acme.test");
    expect((await confirmEmailChange(db, token, NOW)).ok).toBe(true);
    await db.query("UPDATE users SET email = 'ana@acme.test' WHERE id = $1", [userId]);
    expect(await confirmEmailChange(db, token, NOW)).toEqual({ ok: false, reason: "expired" });
    expect(await emailOf(db, userId)).toBe("ana@acme.test");
  });

  it("expires after an hour, and refuses unknown and malformed tokens", async () => {
    const { db, userId, request } = await setup();
    const token = await request("new@acme.test");
    const late = NOW + EMAIL_CHANGE_TTL_MS;
    expect(await isEmailChangeUsable(db, token, late)).toBe(false);
    expect(await confirmEmailChange(db, token, late)).toEqual({ ok: false, reason: "expired" });
    for (const bad of ["x".repeat(43), "not a token", ""]) {
      expect(await confirmEmailChange(db, bad, NOW)).toEqual({ ok: false, reason: "expired" });
    }
    expect(await emailOf(db, userId)).toBe("ana@acme.test");
  });

  it("refuses a deleted user's link", async () => {
    const { db, userId, request } = await setup();
    const token = await request("new@acme.test");
    await db.query("UPDATE users SET deleted_at = now() WHERE id = $1", [userId]);
    expect(await isEmailChangeUsable(db, token, NOW)).toBe(false);
    expect(await confirmEmailChange(db, token, NOW)).toEqual({ ok: false, reason: "expired" });
  });

  it("fails cleanly when another account took the address first, changing nothing", async () => {
    const { db, userId, request } = await setup();
    const session = await createSession(db, userId, NOW);
    const token = await request("new@acme.test");
    // Between the request and the confirm, someone else gets the address.
    const bo = await insertUser(db, "bo@acme.test");
    await db.query("UPDATE users SET email = 'new@acme.test' WHERE id = $1", [bo]);

    expect(await confirmEmailChange(db, token, NOW)).toEqual({ ok: false, reason: "taken" });
    expect(await emailOf(db, userId)).toBe("ana@acme.test");
    expect(await readSession(db, session, NOW)).not.toBeNull();
    const { rows } = await db.query(
      "SELECT action FROM audit_log WHERE action = 'user.email_changed'",
    );
    expect(rows).toEqual([]);
  });

  it("treats a unique violation from a concurrent change as taken", async () => {
    const { db, request } = await setup();
    const token = await request("new@acme.test");
    const racing: Database = {
      query: db.query.bind(db),
      transaction: () => Promise.reject(Object.assign(new Error("duplicate"), { code: "23505" })),
    };
    expect(await confirmEmailChange(racing, token, NOW)).toEqual({ ok: false, reason: "taken" });
  });
});
