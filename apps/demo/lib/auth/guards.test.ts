import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { seat, twoWorkspaces, type Seat } from "@/test/workspace-fixture";
import { database, type Database } from "../db/database";
import { apiAccount, apiMember, getSession } from "./guards";
import { sessionTokenOf } from "./session-cookie";

const holder = vi.hoisted(() => ({
  db: null as Database | null,
  /** The session cookie's value `getSession` sees, if any. */
  token: undefined as string | undefined,
}));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: vi.fn(() => (holder.db ? Promise.resolve(holder.db) : null)),
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({ get: () => (holder.token ? { value: holder.token } : undefined) }),
}));

let db: Database;
let a: Seat;
let b: Seat;

beforeEach(async () => {
  ({ db, a, b } = await twoWorkspaces());
  holder.db = db;
  holder.token = undefined;
  vi.mocked(database).mockClear();
});

const request = (cookie?: string) =>
  new Request("http://localhost/api/w/x", { headers: cookie ? { cookie } : {} });

async function status(result: Awaited<ReturnType<typeof apiMember>>) {
  return result.ok ? 200 : [result.response.status, await result.response.json()];
}

describe("apiMember", () => {
  it("gives a member the workspace the session belongs to", async () => {
    const result = await apiMember(request(`theme=dark; ${a.cookie}`), a.workspaceId);
    expect(result.ok && result.membership).toEqual({
      workspaceId: a.workspaceId,
      slug: "acme",
      name: "acme",
      role: "owner",
    });
    expect(result.ok && result.user.id).toBe(a.userId);
  });

  it("answers 401 without a session, with an unknown one, or without a database", async () => {
    expect(await status(await apiMember(request(), a.workspaceId))).toEqual([
      401,
      { error: "unauthenticated" },
    ]);
    const unknown = request(`squint_session=${"x".repeat(43)}`);
    expect(await status(await apiMember(unknown, a.workspaceId))).toEqual([
      401,
      { error: "unauthenticated" },
    ]);
    holder.db = null;
    expect(await status(await apiMember(request(a.cookie), a.workspaceId))).toEqual([
      401,
      { error: "unauthenticated" },
    ]);
  });

  it("answers 404, never 403, for any workspace the session isn't a member of", async () => {
    const admin = await seat(db, "admin-ws");
    await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.userId]);
    for (const [cookie, workspaceId] of [
      [b.cookie, a.workspaceId],
      [admin.cookie, a.workspaceId],
      [a.cookie, crypto.randomUUID()],
      [a.cookie, "not-a-uuid"],
    ] as const) {
      expect(await status(await apiMember(request(cookie), workspaceId))).toEqual([
        404,
        { error: "not-found" },
      ]);
    }
    await db.query("UPDATE workspaces SET archived_at = now() WHERE id = $1", [a.workspaceId]);
    expect(await status(await apiMember(request(a.cookie), a.workspaceId))).toEqual([
      404,
      { error: "not-found" },
    ]);
  });
});

/**
 * Without a session cookie there is nothing to look up, so the guards don't
 * touch the database: a signed-out page that started a connect without
 * waiting for it could leave it frozen half-done for every later request.
 */
describe("guards without a session cookie", () => {
  it("leave the database alone", async () => {
    expect(await getSession()).toBeNull();
    expect((await apiAccount(request("theme=dark"))).ok).toBe(false);
    expect((await apiMember(request(), a.workspaceId)).ok).toBe(false);
    expect(database).not.toHaveBeenCalled();
  });

  it("read the session once there is a cookie", async () => {
    holder.token = sessionTokenOf(a.cookie) ?? undefined;
    expect((await getSession())?.id).toBe(a.userId);
    expect(database).toHaveBeenCalled();
  });
});

describe("sessionTokenOf", () => {
  it("finds the session cookie among others", () => {
    expect(sessionTokenOf("a=1; squint_session=abc; b=2")).toBe("abc");
    expect(sessionTokenOf("squint_sessionx=abc")).toBeNull();
    expect(sessionTokenOf(null)).toBeNull();
    expect(sessionTokenOf("squint_session=")).toBeNull();
  });
});
