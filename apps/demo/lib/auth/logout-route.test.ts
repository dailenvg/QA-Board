import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/logout/route";
import type * as DatabaseModule from "@/lib/db/database";
import { insertUser } from "@/test/accounts-fixture";
import { migratedPglite } from "@/test/pglite";
import { insertSession, readSession } from "@/test/sessions-fixture";
import { database, type Database } from "../db/database";

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: vi.fn(() => (holder.db ? Promise.resolve(holder.db) : null)),
}));

const ORIGIN = "http://127.0.0.1:3100";

function logout(cookie?: string, origin = ORIGIN) {
  return POST(
    new NextRequest(`${ORIGIN}/api/auth/logout`, {
      method: "POST",
      headers: { origin, host: "127.0.0.1:3100", ...(cookie ? { cookie } : {}) },
    }),
  );
}

let db: Database;
let userId: string;
let token: string;

beforeEach(async () => {
  db = await migratedPglite();
  holder.db = db;
  userId = await insertUser(db, "ana@acme.test");
  token = await insertSession(db, userId, Date.now());
  vi.mocked(database).mockClear();
});

describe("POST /api/auth/logout", () => {
  it("ends this browser's session, clears the cookie and writes the sign-out down", async () => {
    const response = await logout(`squint_session=${token}`);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(response.headers.get("set-cookie")).toMatch(/^squint_session=;.*Max-Age=0/);
    expect(await readSession(db, token, Date.now())).toBeNull();
    const { rows } = await db.query("SELECT actor_user_id, action, target_id FROM audit_log");
    expect(rows).toEqual([{ actor_user_id: userId, action: "user.signed_out", target_id: userId }]);
  });

  it("clears the cookie without a lookup when it can't be a session", async () => {
    for (const cookie of [undefined, "squint_session=junk"]) {
      const response = await logout(cookie);
      expect(response.status).toBe(303);
      expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    }
    expect(database).not.toHaveBeenCalled();
  });

  it("clears the cookie when the database can't be reached, and audits nothing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    holder.db = {
      query: () =>
        Promise.reject(Object.assign(new Error("down ana@acme.test"), { code: "08006" })),
      transaction: () => Promise.reject(new Error("down")),
    };
    const response = await logout(`squint_session=${token}`);
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect(error.mock.calls.flat().map(String).join("\n")).not.toContain("ana@acme.test");
    holder.db = db;
    const { rows } = await db.query("SELECT 1 FROM audit_log");
    expect(rows).toEqual([]);
  });

  it("refuses another site's post, leaving the session alone", async () => {
    const response = await logout(`squint_session=${token}`, "https://evil.example");
    expect(response.status).toBe(403);
    expect(await readSession(db, token, Date.now())).not.toBeNull();
  });
});
