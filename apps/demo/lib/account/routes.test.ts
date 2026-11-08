import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as NextServer from "next/server";
import type * as DatabaseModule from "@/lib/db/database";
import { ACCOUNT_ENDPOINTS, callAccount } from "@/test/account-routes";
import { insertUser, PASSWORD } from "@/test/accounts-fixture";
import { migratedPglite } from "@/test/pglite";
import { createSession, readSession } from "../auth/sessions";
import type { Database } from "../db/database";
import type { EmailChangeLink } from "./email-change";

const holder = vi.hoisted(() => ({
  db: null as Database | null,
  tasks: [] as Array<() => Promise<void>>,
  links: [] as Array<{ to: string; link: string }>,
}));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof NextServer>()),
  after: (task: () => Promise<void>) => {
    holder.tasks.push(task);
  },
}));

vi.mock("@/lib/account/account-email", () => ({
  emailChangeLinkSender: () => (email: EmailChangeLink) => {
    holder.links.push(email);
    return Promise.resolve();
  },
}));

const EMAIL = "ana@acme.test";
const NEW_PASSWORD = "a brand new password";

let db: Database;
let userId: string;
let cookie: string;

/** Every queued after-response task, run as Next would once the response is sent. */
async function drain(): Promise<void> {
  for (const task of holder.tasks.splice(0)) await task();
}

async function sessionCount(id: string): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM sessions WHERE user_id = $1",
    [id],
  );
  return rows[0]?.count ?? 0;
}

async function auditMeta(): Promise<Array<{ action: string; meta: unknown }>> {
  const { rows } = await db.query<{ action: string; meta: unknown }>(
    "SELECT action, meta FROM audit_log ORDER BY id",
  );
  return rows;
}

beforeEach(async () => {
  holder.tasks.length = 0;
  holder.links.length = 0;
  db = await migratedPglite();
  holder.db = db;
  userId = await insertUser(db, EMAIL);
  cookie = `squint_session=${await createSession(db, userId, Date.now())}`;
});

describe("every account route", () => {
  it.each(ACCOUNT_ENDPOINTS)("$method $path answers 401 without a session", async (route) => {
    const response = await callAccount(route.method, route.path);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
    const unknown = await callAccount(route.method, route.path, {
      cookie: `squint_session=${"x".repeat(43)}`,
    });
    expect(unknown.status).toBe(401);
  });

  it.each(ACCOUNT_ENDPOINTS)("$method $path refuses another site's Origin", async (route) => {
    const response = await callAccount(route.method, route.path, {
      cookie,
      headers: { origin: "https://evil.test" },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "cross-site" });
  });

  it.each(ACCOUNT_ENDPOINTS)("$method $path refuses a body that isn't JSON", async (route) => {
    for (const type of ["application/x-www-form-urlencoded", "text/plain", "multipart/form-data"]) {
      const response = await callAccount(route.method, route.path, {
        cookie,
        body: "name=Eve",
        headers: { "content-type": type },
      });
      expect(response.status).toBe(415);
    }
  });

  it("answers 401 when there's no database", async () => {
    holder.db = null;
    for (const route of ACCOUNT_ENDPOINTS) {
      expect((await callAccount(route.method, route.path, { cookie })).status).toBe(401);
    }
  });
});

describe("PATCH /api/account/profile", () => {
  it("saves the trimmed name for the session's user only, whatever id the body names", async () => {
    const other = await insertUser(db, "bo@acme.test");
    const response = await callAccount("PATCH", "/api/account/profile", {
      cookie,
      body: { name: "  Ana Lima  ", userId: other, id: other },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "Ana Lima" });
    const { rows } = await db.query<{ id: string; name: string | null }>(
      "SELECT id, name FROM users ORDER BY email",
    );
    expect(rows).toEqual([
      { id: userId, name: "Ana Lima" },
      { id: other, name: null },
    ]);
    expect(await auditMeta()).toEqual([
      { action: "user.name_changed", meta: { fields: ["name"] } },
    ]);
  });

  it("refuses an empty or too long name", async () => {
    for (const name of ["   ", "x".repeat(81), 42]) {
      const response = await callAccount("PATCH", "/api/account/profile", {
        cookie,
        body: { name },
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid", field: "name" });
    }
  });
});

describe("POST /api/account/password", () => {
  it("changes the password, signs out the other browsers and gives this one a new cookie", async () => {
    const other = await createSession(db, userId, Date.now());
    const response = await callAccount("POST", "/api/account/password", {
      cookie,
      body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(response.status).toBe(200);
    const fresh = /^squint_session=([A-Za-z0-9_-]{43});/.exec(
      response.headers.get("set-cookie") ?? "",
    )?.[1];
    expect(fresh).toBeDefined();
    expect(await readSession(db, other, Date.now())).toBeNull();
    expect(await readSession(db, cookie.split("=")[1] ?? "", Date.now())).toBeNull();
    expect(await readSession(db, fresh ?? "", Date.now())).not.toBeNull();
  });

  it("answers a wrong current password with 422, and the budget with 429", async () => {
    const wrong = () =>
      callAccount("POST", "/api/account/password", {
        cookie,
        body: { currentPassword: "not my password", newPassword: NEW_PASSWORD },
      });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await wrong();
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "wrong-password" });
    }
    const locked = await wrong();
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("refuses a new password that breaks the rules", async () => {
    const response = await callAccount("POST", "/api/account/password", {
      cookie,
      body: { currentPassword: PASSWORD, newPassword: "short" },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid", field: "newPassword" });
  });
});

describe("POST /api/account/email", () => {
  const request = (newEmail: string, currentPassword = PASSWORD) =>
    callAccount("POST", "/api/account/email", { cookie, body: { currentPassword, newEmail } });

  it("answers the same for a free and a taken address, mailing only the free one", async () => {
    await insertUser(db, "taken@acme.test");
    const free = await request("Free@Acme.test ");
    const taken = await request("taken@acme.test");
    expect([free.status, taken.status]).toEqual([202, 202]);
    expect(await free.json()).toEqual({ ok: true });
    expect(await taken.json()).toEqual({ ok: true });
    expect(free.headers.get("set-cookie")).toBeNull();
    // Nothing is sent before the response.
    expect(holder.links).toEqual([]);
    await drain();
    expect(holder.links.map((link) => link.to)).toEqual(["free@acme.test"]);
    expect(holder.links[0]?.link).toMatch(/\/email-change\/[A-Za-z0-9_-]{43}$/);
    // The address doesn't move until the link is used.
    const { rows } = await db.query("SELECT email FROM users WHERE id = $1", [userId]);
    expect(rows).toEqual([{ email: EMAIL }]);
  });

  it("refuses the current address, a wrong password, and a fourth request in an hour", async () => {
    expect((await request(" ANA@acme.test")).status).toBe(422);
    const wrong = await request("new@acme.test", "not my password");
    expect(wrong.status).toBe(422);
    expect(await wrong.json()).toEqual({ error: "wrong-password" });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await request(`new${attempt}@acme.test`)).status).toBe(202);
    }
    const capped = await request("new4@acme.test");
    expect(capped.status).toBe(429);
    expect(await capped.json()).toEqual({ error: "too-many-requests" });
  });

  it("keeps addresses, hashes and tokens out of the audit log", async () => {
    await request("new@acme.test");
    await drain();
    const logged = JSON.stringify(await auditMeta());
    expect(logged).toContain("user.email_change_requested");
    expect(logged).not.toMatch(/@|[0-9a-f]{64}/);
    expect(logged).not.toContain(holder.links[0]?.link.split("/").at(-1) ?? "none");
  });
});

describe("DELETE /api/account/sessions", () => {
  it("deletes every session of the user, this browser's included, and clears its cookie", async () => {
    await createSession(db, userId, Date.now());
    const other = await insertUser(db, "bo@acme.test");
    await createSession(db, other, Date.now());
    expect(await sessionCount(userId)).toBe(2);
    const response = await callAccount("DELETE", "/api/account/sessions", { cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/^squint_session=;.*Max-Age=0/i);
    expect(await sessionCount(userId)).toBe(0);
    expect(await sessionCount(other)).toBe(1);
    expect(await auditMeta()).toEqual([
      { action: "user.signed_out_everywhere", meta: { fields: ["sessions"] } },
    ]);
  });
});
