import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { seat, twoWorkspaces, type Seat } from "@/test/workspace-fixture";
import { sessionTokenOf } from "../auth/session-cookie";
import type { Database } from "../db/database";
import { loadAdminOverviewPage, loadAuditLogPage } from "./admin-pages";

/**
 * Every admin page's read checks the session itself: the admin reads, anyone
 * else signed in gets the 404 (as if /admin didn't exist), anyone signed out
 * goes to /login. Nothing is read before the check.
 */

const holder = vi.hoisted(() => ({
  db: null as Database | null,
  token: undefined as string | undefined,
}));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: vi.fn(() => (holder.db ? Promise.resolve(holder.db) : null)),
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({ get: () => (holder.token ? { value: holder.token } : undefined) }),
  headers: () => Promise.resolve(new Headers({ "x-squint-path": "/admin/audit?action=x.y" })),
}));

class NotFound extends Error {}
class Redirect extends Error {}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not found");
  },
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));

let db: Database;
let company: Seat;
let admin: Seat;

// One database for the file: no test changes what's in it.
beforeAll(async () => {
  ({ db, a: company } = await twoWorkspaces());
  admin = await seat(db, "admin-home");
  await db.query("DELETE FROM memberships WHERE user_id = $1", [admin.userId]);
  await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.userId]);
  holder.db = db;
});

beforeEach(() => {
  holder.token = undefined;
});

const signInAs = (who: Seat) => {
  holder.token = sessionTokenOf(who.cookie) ?? undefined;
};

describe("admin page reads", () => {
  it("give a company user the 404, before reading anything", async () => {
    signInAs(company);
    const spy = vi.spyOn(db, "query");
    spy.mockClear();
    await expect(loadAdminOverviewPage()).rejects.toBeInstanceOf(NotFound);
    await expect(loadAuditLogPage({})).rejects.toBeInstanceOf(NotFound);
    const reads = spy.mock.calls.map(([sql]) => sql).filter((sql) => !/sessions/.test(sql));
    expect(reads).toEqual([]);
  });

  it("send anyone signed out to sign in, back to the page they asked for", async () => {
    await expect(loadAdminOverviewPage()).rejects.toThrow(
      new Redirect("/login?next=%2Fadmin%2Faudit%3Faction%3Dx.y"),
    );
  });

  it("read for the admin", async () => {
    signInAs(admin);
    const overview = await loadAdminOverviewPage();
    expect(overview.kind).toBe("ready");
    expect(overview.kind === "ready" && overview.overview.counts.workspaces).toBe(3);
    const audit = await loadAuditLogPage({ action: "user.name_changed", workspace: "nope" });
    expect(audit.kind === "ready" && audit.params).toEqual({ action: "user.name_changed" });
  });

  it("say unavailable when the read fails, and log its kind only", async () => {
    signInAs(admin);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const query = db.query.bind(db);
    vi.spyOn(db, "query").mockImplementation((text, params) =>
      /audit_log/.test(text)
        ? Promise.reject(new Error("boom ana@acme.test"))
        : query(text, params),
    );
    expect(await loadAuditLogPage({})).toEqual({ kind: "unavailable" });
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/^squint admin: audit log read failed/),
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("ana@acme.test");
  });
});
