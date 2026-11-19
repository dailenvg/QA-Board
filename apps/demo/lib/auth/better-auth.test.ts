import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { insertUser, NOW, PASSWORD } from "@/test/accounts-fixture";
import { addMember, membersWorld, removeMember } from "@/test/members-fixture";
import { migratedPglite } from "@/test/pglite";
import type { Database } from "../db/database";
import { createSecret, hashSecret } from "../share/tokens";
import { authSecret } from "./auth-secret";
import {
  authFor,
  endSession,
  findSessionUser,
  signInWithPassword,
  startSession,
} from "./better-auth";
import { handleLogin } from "./login-handler";
import { SESSION_TTL_MS } from "./session-cookie";
import { authCookieHeader, signSessionToken, verifySessionToken } from "./session-token";

const DAY = 86_400_000;
const CALLER = { ip: "203.0.113.9" };
const EMAIL = "ana@acme.test";

/** A session row as the code before Better Auth wrote it; returns the browser's cookie value. */
async function legacySession(db: Database, userId: string, expiresAt: number): Promise<string> {
  const token = createSecret();
  await db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
    hashSecret(token),
    userId,
    new Date(expiresAt),
  ]);
  return token;
}

async function expiresAt(db: Database, tokenHash: string): Promise<number | null> {
  const { rows } = await db.query<{ expires_at: Date }>(
    "SELECT expires_at FROM sessions WHERE token_hash = $1",
    [tokenHash],
  );
  return rows[0] ? new Date(rows[0].expires_at).getTime() : null;
}

const cookieOf = (value: string) => authCookieHeader(value, authSecret()) ?? "";

/** The session cookie's value in a `Set-Cookie` header, decoded. */
function setCookieValue(headers: Headers): string {
  return decodeURIComponent(
    /^squint_session=([^;]+);/.exec(headers.get("set-cookie") ?? "")?.[1] ?? "",
  );
}

/** Reads `cookie`'s session through Better Auth, with the headers it answers. */
function getSessionWithHeaders(db: Database, cookie: string) {
  return authFor(db).api.getSession({
    headers: new Headers({ cookie }),
    query: { disableCookieCache: true },
    returnHeaders: true,
  });
}

describe("Better Auth on Squint's tables", () => {
  it("signs in against a seeded Argon2 hash, with a session Better Auth reads back", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, EMAIL);
    const signedIn = await signInWithPassword(
      db,
      { email: EMAIL, password: PASSWORD },
      CALLER,
      NOW,
    );
    const value = signedIn?.token ?? "";
    const token = verifySessionToken(value, authSecret());
    const { rows } = await db.query(
      "SELECT user_id, ip_address FROM sessions WHERE token_hash = $1",
      [token],
    );
    expect(rows).toEqual([{ user_id: userId, ip_address: CALLER.ip }]);
    expect(await findSessionUser(db, cookieOf(value))).toEqual({
      id: userId,
      email: EMAIL,
      name: null,
      role: "company",
    });
  });

  it("keeps no browser or address it wasn't told: null, not empty", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, EMAIL);
    await startSession(db, userId, NOW);
    await signInWithPassword(db, { email: EMAIL, password: PASSWORD }, CALLER, NOW);
    const { rows } = await db.query(
      "SELECT ip_address, user_agent FROM sessions ORDER BY ip_address NULLS FIRST",
    );
    expect(rows).toEqual([
      { ip_address: null, user_agent: null },
      { ip_address: CALLER.ip, user_agent: null },
    ]);
  });

  it("signs a cookie as Squint's signer does, when it slides a session", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, EMAIL);
    const token = await legacySession(db, userId, Date.now() + DAY);
    const { headers, response } = await getSessionWithHeaders(db, cookieOf(token));
    expect(response?.user.id).toBe(userId);
    expect(setCookieValue(headers)).toBe(signSessionToken(hashSecret(token), authSecret()));
  });

  it("refuses its own sign-in and sign-up: Squint checks passwords itself", async () => {
    const db = await migratedPglite();
    await insertUser(db, EMAIL);
    await expect(
      authFor(db).api.signInEmail({ body: { email: EMAIL, password: PASSWORD } }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      authFor(db).api.signUpEmail({
        body: { email: "new@acme.test", password: PASSWORD, name: "New" },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    const { rows } = await db.query("SELECT 1 FROM sessions");
    expect(rows).toEqual([]);
  });

  it("reads a session from before Better Auth by its legacy cookie, and slides it", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, EMAIL);
    const token = await legacySession(db, userId, Date.now() + DAY);
    expect((await findSessionUser(db, cookieOf(token)))?.id).toBe(userId);
    const slid = await expiresAt(db, hashSecret(token));
    expect(slid).toBeGreaterThan(Date.now() + SESSION_TTL_MS - DAY);
  });

  it("leaves a session used within the day as it is", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, EMAIL);
    const until = Date.now() + SESSION_TTL_MS - 1000;
    const token = await legacySession(db, userId, until);
    await findSessionUser(db, cookieOf(token));
    expect(await expiresAt(db, hashSecret(token))).toBe(until);
  });

  it("reads no one for an expired session, a deleted user or an unknown token", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, EMAIL);
    const expired = await legacySession(db, userId, Date.now() - 1000);
    expect(await findSessionUser(db, cookieOf(expired))).toBeNull();
    const live = await legacySession(db, userId, Date.now() + DAY);
    await db.query("UPDATE users SET deleted_at = now() WHERE id = $1", [userId]);
    expect(await findSessionUser(db, cookieOf(live))).toBeNull();
    expect(await findSessionUser(db, cookieOf(createSecret()))).toBeNull();
  });

  it("signs one browser out, saying who it was", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, EMAIL);
    const laptop = await legacySession(db, userId, Date.now() + DAY);
    const phone = await legacySession(db, userId, Date.now() + DAY);
    expect((await endSession(db, cookieOf(laptop)))?.id).toBe(userId);
    expect(await findSessionUser(db, cookieOf(laptop))).toBeNull();
    expect((await findSessionUser(db, cookieOf(phone)))?.id).toBe(userId);
    expect(await endSession(db, cookieOf(laptop))).toBeNull();
  });

  it("starts no session for a removed or suspended account until the password is right", async () => {
    const world = await membersWorld();
    const ben = await addMember(world.db, world.workspaceId, undefined, "ben@acme.test");
    await removeMember(world.db, ben.user.id, world.workspaceId, NOW);
    const signIn = (email: string, password: string) =>
      signInWithPassword(world.db, { email, password }, CALLER, NOW);
    expect(await signIn("ben@acme.test", "wrong password")).toBeNull();
    await expect(signIn("ben@acme.test", PASSWORD)).rejects.toMatchObject({
      statusCode: 403,
      body: { code: "SQUINT_SIGN_IN_REMOVED" },
    });
    await world.db.query("UPDATE workspaces SET suspended_at = now() WHERE id = $1", [
      world.workspaceId,
    ]);
    expect(await signIn(world.owner.user.email, "wrong password")).toBeNull();
    await expect(signIn(world.owner.user.email, PASSWORD)).rejects.toMatchObject({
      body: { code: "SQUINT_SIGN_IN_SUSPENDED" },
    });
    const { rows } = await world.db.query(
      "SELECT 1 FROM sessions WHERE user_id = ANY($1::uuid[]) AND ip_address IS NOT NULL",
      [[ben.user.id, world.owner.user.id]],
    );
    expect(rows).toEqual([]);
  });
});

describe("Better Auth's secret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is Squint's derived key, whatever BETTER_AUTH_SECRETS says", async () => {
    vi.stubEnv("BETTER_AUTH_SECRETS", `1:${"z".repeat(64)}`);
    const db = await migratedPglite();
    const userId = await insertUser(db, EMAIL);
    expect((await authFor(db).$context).secret).toBe(authSecret());
    const token = await legacySession(db, userId, Date.now() + DAY);
    const { headers } = await getSessionWithHeaders(db, cookieOf(token));
    const value = setCookieValue(headers);
    expect(value).toBe(signSessionToken(hashSecret(token), authSecret()));
    expect((await findSessionUser(db, cookieOf(value)))?.email).toBe(EMAIL);
  });
});

describe("Better Auth's own words", () => {
  const login = (db: Database, body: unknown) =>
    handleLogin(
      new NextRequest("http://127.0.0.1:3100/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.20" },
        body: JSON.stringify(body),
      }),
      { db: Promise.resolve(db), now: NOW },
    );

  it("never reach a response: each refusal answers with Squint's code alone", async () => {
    const db = await migratedPglite();
    await insertUser(db, EMAIL);
    for (const body of [
      { email: EMAIL, password: "wrong password" },
      { email: "nobody@acme.test", password: PASSWORD },
      { email: "not an email", password: PASSWORD },
    ]) {
      const response = await login(db, body);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "invalid-credentials" });
    }
  });

  it("nor a storage failure inside Better Auth: a JSON 500 that logs no message", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const db = await migratedPglite();
    await insertUser(db, EMAIL);
    // The password checks out; Better Auth's insert of the session fails.
    await db.query("ALTER TABLE sessions DROP COLUMN user_agent");
    const response = await login(db, { email: EMAIL, password: PASSWORD });
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: "storage" });
    const logged = error.mock.calls.flat().map(String).join("\n");
    expect(logged).not.toContain(EMAIL);
    expect(logged).toContain("squint auth: storage failed");
  });
});
