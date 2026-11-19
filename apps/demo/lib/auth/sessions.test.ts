import { describe, expect, it } from "vitest";
import { insertUser, NOW } from "@/test/accounts-fixture";
import { migratedPglite } from "@/test/pglite";
import { readSession } from "@/test/sessions-fixture";
import { hashSecret } from "../share/tokens";
import { SESSION_TTL_MS } from "./session-cookie";
import { createSession, deleteUserSessions, rotateSessions } from "./sessions";

async function expiresAt(db: Awaited<ReturnType<typeof migratedPglite>>, token: string) {
  const { rows } = await db.query<{ expires_at: Date }>(
    "SELECT expires_at FROM sessions WHERE token_hash = $1",
    [hashSecret(token)],
  );
  return rows[0] ? new Date(rows[0].expires_at).getTime() : null;
}

describe("sessions", () => {
  it("stores only the token's hash, for 30 days", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, "ana@acme.test");
    const token = await createSession(db, userId, NOW);
    const { rows } = await db.query<{ token_hash: string }>("SELECT token_hash FROM sessions");
    expect(rows).toEqual([{ token_hash: hashSecret(token) }]);
    expect(await expiresAt(db, token)).toBe(NOW + SESSION_TTL_MS);
  });

  it("signs out every browser, and rotates after a password change", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, "ana@acme.test");
    const phone = await createSession(db, userId, NOW);
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
