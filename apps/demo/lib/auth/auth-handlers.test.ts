import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { insertUser, NOW, PASSWORD } from "@/test/accounts-fixture";
import { migratedPglite } from "@/test/pglite";
import type { Queryable } from "../share/migrate";
import { handleLogin } from "./login-handler";
import { RESET_TTL_MS, type ResetEmail } from "./password-reset";
import { handleResetComplete } from "./reset-complete-handler";
import { handleResetRequest } from "./reset-request-handler";

const ORIGIN = "http://127.0.0.1:3100";
const EMAIL = "ana@acme.test";
const NEW_PASSWORD = "a brand new password";

/** A plain HTML form post, as a browser sends one before the page hydrates. */
function formPost(path: string, fields: Record<string, string>, ip = "203.0.113.9") {
  return new NextRequest(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: ORIGIN,
      host: "127.0.0.1:3100",
      "x-forwarded-for": ip,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

function jsonPost(path: string, body: unknown) {
  return new NextRequest(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.20" },
    body: JSON.stringify(body),
  });
}

/** Where a 303 sends the browser, as path and query. */
function location(response: Response): string {
  expect(response.status).toBe(303);
  const target = response.headers.get("location") ?? "";
  // Relative, on this site: the browser stays on the host it posted to.
  expect(target).toMatch(/^\/(?!\/)/);
  return target;
}

/** Nothing the person typed may reach a URL. */
function expectNoCredentials(response: Response, ...secrets: string[]) {
  const target = decodeURIComponent(response.headers.get("location") ?? "");
  for (const secret of secrets) expect(target).not.toContain(secret);
}

async function setup(): Promise<Queryable> {
  const db = await migratedPglite();
  await insertUser(db, EMAIL);
  return db;
}

describe("login form posts (before hydration)", () => {
  it("signs in with a 303 to next, setting the session cookie", async () => {
    const db = await setup();
    const response = await handleLogin(
      formPost("/api/auth/login", { email: EMAIL, password: PASSWORD, next: "/f/abc" }),
      { db: Promise.resolve(db), now: NOW },
    );
    expect(location(response)).toBe("/f/abc?welcome=1");
    expect(response.headers.get("set-cookie")).toMatch(/^squint_session=[A-Za-z0-9_-]{43};/);
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expectNoCredentials(response, PASSWORD, EMAIL);
  });

  it("sends a wrong password back to /login with a code, not the password or email", async () => {
    const db = await setup();
    const response = await handleLogin(
      formPost("/api/auth/login", { email: EMAIL, password: "wrong password", next: "/p/1" }),
      { db: Promise.resolve(db), now: NOW },
    );
    expect(location(response)).toBe("/login?next=%2Fp%2F1&error=invalid-credentials");
    expect(response.headers.get("set-cookie")).toBeNull();
    expectNoCredentials(response, "wrong password", EMAIL);
  });

  it("reports the lock with its seconds, and drops an unsafe next", async () => {
    const db = await setup();
    const deps = { db: Promise.resolve(db), now: NOW };
    const attempt = () =>
      handleLogin(
        formPost("/api/auth/login", { email: EMAIL, password: "nope", next: "//evil.test" }),
        deps,
      );
    for (let index = 0; index < 5; index += 1) await attempt();
    const response = await attempt();
    expect(location(response)).toBe("/login?error=rate-limited&retry=900");
  });

  it("answers a missing database or an empty form with a code too", async () => {
    const empty = await handleLogin(formPost("/api/auth/login", {}), {
      db: Promise.resolve(await setup()),
      now: NOW,
    });
    expect(location(empty)).toBe("/login?error=invalid-credentials");
    const offline = await handleLogin(
      formPost("/api/auth/login", { email: EMAIL, password: PASSWORD }),
      { db: null, now: NOW },
    );
    expect(location(offline)).toBe("/login?error=not-configured");
  });

  it("refuses a form posted from another site", async () => {
    const request = formPost("/api/auth/login", { email: EMAIL, password: PASSWORD });
    request.headers.set("origin", "https://evil.test");
    const response = await handleLogin(request, { db: Promise.resolve(await setup()), now: NOW });
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("leaves the hydrated form's JSON path as it was", async () => {
    const deps = { db: Promise.resolve(await setup()), now: NOW };
    const signedIn = await handleLogin(
      jsonPost("/api/auth/login", { email: EMAIL, password: PASSWORD }),
      deps,
    );
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toEqual({ ok: true });
    expect(signedIn.headers.get("set-cookie")).toMatch(/^squint_session=/);
    const refused = await handleLogin(
      jsonPost("/api/auth/login", { email: EMAIL, password: "x" }),
      deps,
    );
    expect(refused.status).toBe(401);
    expect(await refused.json()).toEqual({ error: "invalid-credentials" });
  });
});

describe("reset request form posts (before hydration)", () => {
  function deps(db: Queryable, sent: ResetEmail[]) {
    const tasks: Array<() => Promise<void>> = [];
    return {
      tasks,
      value: {
        db: Promise.resolve(db),
        now: NOW,
        origin: new URL("https://squint.test"),
        send: (email: ResetEmail) => {
          sent.push(email);
          return Promise.resolve();
        },
        defer: (task: () => Promise<void>) => {
          tasks.push(task);
        },
      },
    };
  }

  it("answers known and unknown emails with the same 303, without the email", async () => {
    const db = await setup();
    const sent: ResetEmail[] = [];
    const { tasks, value } = deps(db, sent);
    const known = await handleResetRequest(
      formPost("/api/auth/reset", { email: EMAIL }, "198.51.100.1"),
      value,
    );
    const unknown = await handleResetRequest(
      formPost("/api/auth/reset", { email: "nobody@acme.test" }, "198.51.100.1"),
      value,
    );
    expect(location(known)).toBe("/reset?sent=1");
    expect(location(unknown)).toBe("/reset?sent=1");
    expectNoCredentials(known, EMAIL);
    await Promise.all(tasks.map((task) => task()));
    expect(sent.map((email) => email.to)).toEqual([EMAIL]);
  });

  it("flags a malformed email without echoing it", async () => {
    const { value } = deps(await setup(), []);
    const response = await handleResetRequest(
      formPost("/api/auth/reset", { email: "not-an-email" }, "198.51.100.2"),
      value,
    );
    expect(location(response)).toBe("/reset?error=invalid-email");
    expectNoCredentials(response, "not-an-email");
  });
});

describe("reset complete form posts (before hydration)", () => {
  /** A real reset link's token for `EMAIL`. */
  async function linkToken(db: Queryable): Promise<string> {
    const sent: ResetEmail[] = [];
    const { requestPasswordReset } = await import("./password-reset");
    await requestPasswordReset(db, EMAIL, {
      now: NOW,
      origin: new URL("https://squint.test"),
      send: (email) => {
        sent.push(email);
        return Promise.resolve();
      },
    });
    return sent[0]?.link.split("/reset/")[1] ?? "";
  }

  it("sets the password with a 303 to sign in, never putting it in a URL", async () => {
    const db = await setup();
    const token = await linkToken(db);
    const deps = { db: Promise.resolve(db), now: NOW + 1 };
    const fields = { token, password: NEW_PASSWORD, confirm: NEW_PASSWORD };
    const response = await handleResetComplete(formPost("/api/auth/reset/complete", fields), deps);
    expect(location(response)).toBe("/login?reset=done");
    expectNoCredentials(response, NEW_PASSWORD);
    // The link is spent: posting again goes back to its page, which shows it expired.
    const again = await handleResetComplete(formPost("/api/auth/reset/complete", fields), deps);
    expect(location(again)).toBe(`/reset/${token}`);
  });

  it("sends weak, mismatched and expired submits back to the link with a code", async () => {
    const db = await setup();
    const token = await linkToken(db);
    const post = (fields: Record<string, string>, now = NOW + 1) =>
      handleResetComplete(formPost("/api/auth/reset/complete", { token, ...fields }), {
        db: Promise.resolve(db),
        now,
      });
    const weak = await post({ password: "short", confirm: "short" });
    expect(location(weak)).toBe(`/reset/${token}?error=weak`);
    const mismatch = await post({ password: NEW_PASSWORD, confirm: `${NEW_PASSWORD}!` });
    expect(location(mismatch)).toBe(`/reset/${token}?error=mismatch`);
    expectNoCredentials(mismatch, NEW_PASSWORD);
    const expired = await post(
      { password: NEW_PASSWORD, confirm: NEW_PASSWORD },
      NOW + RESET_TTL_MS,
    );
    expect(location(expired)).toBe(`/reset/${token}`);
    const forged = await handleResetComplete(
      formPost("/api/auth/reset/complete", { token: "../../evil", password: NEW_PASSWORD }),
      { db: Promise.resolve(db), now: NOW },
    );
    expect(location(forged)).toBe("/reset");
  });
});

describe("JSON reset routes", () => {
  it("keep their answers", async () => {
    const db = await setup();
    const defer = vi.fn();
    const accepted = await handleResetRequest(jsonPost("/api/auth/reset", { email: EMAIL }), {
      db: Promise.resolve(db),
      now: NOW,
      origin: new URL("https://squint.test"),
      send: () => Promise.resolve(),
      defer,
    });
    expect(accepted.status).toBe(202);
    expect(defer).toHaveBeenCalledTimes(1);
    const expired = await handleResetComplete(
      jsonPost("/api/auth/reset/complete", { token: "x".repeat(43), password: NEW_PASSWORD }),
      { db: Promise.resolve(db), now: NOW },
    );
    expect(expired.status).toBe(410);
  });
});
