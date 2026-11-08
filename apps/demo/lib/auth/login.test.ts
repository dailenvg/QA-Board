import { describe, expect, it } from "vitest";
import { insertUser, NOW, PASSWORD } from "@/test/accounts-fixture";
import { migratedPglite } from "@/test/pglite";
import { logIn } from "./login";
import { LOGIN_WINDOW_MS, MAX_FAILURES_PER_EMAIL, MAX_FAILURES_PER_IP } from "./rate-limit";
import { readSession } from "./sessions";

const IP = "203.0.113.9";

describe("logIn", () => {
  it("signs in with the right password, whatever the email's case, and starts a session", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, "ana@acme.test");
    const result = await logIn(db, { email: " Ana@ACME.test", password: PASSWORD, ip: IP }, NOW);
    if (!result.ok) throw new Error(result.reason);
    expect(result.user).toEqual({
      id: userId,
      email: "ana@acme.test",
      name: null,
      role: "company",
    });
    expect(await readSession(db, result.token, NOW)).toEqual(result.user);
    const { rows } = await db.query<{ last_login_at: Date }>("SELECT last_login_at FROM users");
    expect(new Date(rows[0]?.last_login_at ?? 0).getTime()).toBe(NOW);
  });

  it("says whether it's the user's first sign-in", async () => {
    const db = await migratedPglite();
    await insertUser(db, "ana@acme.test");
    const attempt = (at: number) =>
      logIn(db, { email: "ana@acme.test", password: PASSWORD, ip: IP }, at);
    expect(await attempt(NOW)).toMatchObject({ ok: true, first: true });
    expect(await attempt(NOW + 1000)).toMatchObject({ ok: true, first: false });
  });

  it("answers the same for a wrong password, an unknown email and a deleted user", async () => {
    const db = await migratedPglite();
    const userId = await insertUser(db, "ana@acme.test");
    await insertUser(db, "gone@acme.test");
    await db.query("UPDATE users SET deleted_at = now() WHERE email = 'gone@acme.test'");
    const attempts = [
      { email: "ana@acme.test", password: "wrong password" },
      { email: "nobody@acme.test", password: PASSWORD },
      { email: "gone@acme.test", password: PASSWORD },
    ];
    for (const attempt of attempts) {
      expect(await logIn(db, { ...attempt, ip: IP }, NOW)).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    const { rows } = await db.query("SELECT 1 FROM sessions WHERE user_id = $1", [userId]);
    expect(rows).toEqual([]);
  });

  it("locks an email after 5 failures for 15 minutes, right password or not", async () => {
    const db = await migratedPglite();
    await insertUser(db, "ana@acme.test");
    const attempt = (password: string, at: number, ip = IP) =>
      logIn(db, { email: "ana@acme.test", password, ip }, at);
    for (let index = 0; index < MAX_FAILURES_PER_EMAIL; index += 1) {
      expect(await attempt("wrong", NOW + index * 1000)).toMatchObject({ reason: "invalid" });
    }
    // From another address too: the email is what's locked.
    expect(await attempt(PASSWORD, NOW + 10_000, "198.51.100.1")).toEqual({
      ok: false,
      reason: "rate-limited",
      // Until the oldest of the five is 15 minutes old.
      retryAfterSeconds: (LOGIN_WINDOW_MS - 10_000) / 1000,
    });
    expect(await attempt(PASSWORD, NOW + LOGIN_WINDOW_MS + 1)).toMatchObject({ ok: true });
    // A success starts the count over.
    expect(await attempt("wrong", NOW + LOGIN_WINDOW_MS + 2)).toMatchObject({ reason: "invalid" });
    expect(await attempt(PASSWORD, NOW + LOGIN_WINDOW_MS + 3)).toMatchObject({ ok: true });
  });

  it("locks an address after 20 failures across emails", async () => {
    const db = await migratedPglite();
    await insertUser(db, "ana@acme.test");
    for (let index = 0; index < MAX_FAILURES_PER_IP; index += 1) {
      await logIn(db, { email: `guess${index}@acme.test`, password: "x", ip: IP }, NOW);
    }
    expect(
      await logIn(db, { email: "ana@acme.test", password: PASSWORD, ip: IP }, NOW + 1),
    ).toMatchObject({ ok: false, reason: "rate-limited" });
    expect(
      await logIn(db, { email: "ana@acme.test", password: PASSWORD, ip: "198.51.100.1" }, NOW + 1),
    ).toMatchObject({ ok: true });
  });

  it("holds both limits when many wrong passwords arrive at once", async () => {
    const db = await migratedPglite();
    await insertUser(db, "ana@acme.test");
    const byEmail = await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        logIn(db, { email: "ana@acme.test", password: "wrong", ip: `198.51.100.${index}` }, NOW),
      ),
    );
    expect(byEmail.filter((result) => !result.ok && result.reason === "invalid")).toHaveLength(
      MAX_FAILURES_PER_EMAIL,
    );
    const byIp = await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        logIn(db, { email: `guess${index}@acme.test`, password: "x", ip: IP }, NOW),
      ),
    );
    expect(byIp.filter((result) => !result.ok && result.reason === "invalid")).toHaveLength(
      MAX_FAILURES_PER_IP,
    );
  });

  it("doesn't count a successful sign-in as an attempt", async () => {
    const db = await migratedPglite();
    await insertUser(db, "ana@acme.test");
    await logIn(db, { email: "ana@acme.test", password: PASSWORD, ip: IP }, NOW);
    const { rows } = await db.query("SELECT 1 FROM login_attempts");
    expect(rows).toEqual([]);
  });
});
