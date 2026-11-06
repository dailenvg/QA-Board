import { describe, expect, it } from "vitest";
import { insertUser, NOW } from "@/test/accounts-fixture";
import { migratedPglite } from "@/test/pglite";
import { hashSecret } from "../share/tokens";
import { SESSION_TTL_MS } from "./session-cookie";
import {
  createSession,
  deleteSession,
  deleteUserSessions,
  readSession,
  rotateSessions,
  SESSION_SLIDE_MS,
} from "./sessions";

const DAY = 86_400_000;

async function expiresAt(db: Awaited<ReturnType<typeof migratedPglite>>, token: string) {
  const { rows } = await db.query<{ expires_at: Date }>(
    "SELECT expires_at FROM sessions WHERE token_hash = $1",
    [hashSecret(token)],
  );
  return rows[0] ? new Date(rows[0].expires_at).getTime() : null;
}

describe("sessions", () => {
  it("stores only the token's hash and reads the user back", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, "ana@acme.test");
    const token = await createSession(db, userId, NOW);
    const { rows } = await db.query<{ token_hash: string }>("SELECT token_hash FROM sessions");
    expect(rows).toEqual([{ token_hash: hashSecret(token) }]);
    expect(await readSession(db, token, NOW)).toEqual({
      id: userId,
      email: "ana@acme.test",
      name: null,
      role: "company",
    });
  });

  it("refuses unknown, malformed and expired tokens, and deleted users", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, "ana@acme.test");
    const token = await createSession(db, userId, NOW);
    expect(await readSession(db, "x".repeat(43), NOW)).toBeNull();
    expect(await readSession(db, "not a token", NOW)).toBeNull();
    expect(await readSession(db, token, NOW + SESSION_TTL_MS)).toBeNull();
    await db.query("UPDATE users SET deleted_at = now() WHERE id = $1", [userId]);
    expect(await readSession(db, token, NOW)).toBeNull();
  });

  it("slides the expiry forward on use, at most once a day", async () => {
    const db = await migratedPglite();
    const token = await createSession(db, await insertUser(db, "ana@acme.test"), NOW);
    await readSession(db, token, NOW + SESSION_SLIDE_MS - 1);
    expect(await expiresAt(db, token)).toBe(NOW + SESSION_TTL_MS);
    // 29 days in: still signed in, and good for 30 more.
    const later = NOW + 29 * DAY;
    expect(await readSession(db, token, later)).not.toBeNull();
    expect(await expiresAt(db, token)).toBe(later + SESSION_TTL_MS);
  });

  it("signs out one browser, or every browser, and rotates after a password change", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, "ana@acme.test");
    const laptop = await createSession(db, userId, NOW);
    const phone = await createSession(db, userId, NOW);
    await deleteSession(db, laptop);
    expect(await readSession(db, laptop, NOW)).toBeNull();
    expect(await readSession(db, phone, NOW)).not.toBeNull();

    const fresh = await rotateSessions(db, userId, NOW);
    expect(await readSession(db, phone, NOW)).toBeNull();
    expect(await readSession(db, fresh, NOW)).not.toBeNull();
    expect(await deleteUserSessions(db, userId)).toBe(1);
    expect(await readSession(db, fresh, NOW)).toBeNull();
  });

  it("clears the user's expired sessions when starting a new one", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, "ana@acme.test");
    const old = await createSession(db, userId, NOW);
    await createSession(db, userId, NOW + SESSION_TTL_MS);
    expect(await expiresAt(db, old)).toBeNull();
  });
});
