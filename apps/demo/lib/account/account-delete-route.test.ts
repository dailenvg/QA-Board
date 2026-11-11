import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as NextServer from "next/server";
import type * as DatabaseModule from "@/lib/db/database";
import { callAccount } from "@/test/account-routes";
import { insertUser, PASSWORD } from "@/test/accounts-fixture";
import {
  addMember,
  countRows,
  deletionWorld,
  OWNER_EMAIL,
  WORKSPACE_NAME,
  type DeletionWorld,
} from "@/test/deletion-fixture";
import { createSession, readSession } from "../auth/sessions";
import { MAX_FAILURES_PER_EMAIL } from "../auth/rate-limit";
import type { Database } from "../db/database";
import type { DeletionNotice } from "./account-email";

const holder = vi.hoisted(() => ({
  db: null as Database | null,
  tasks: [] as Array<() => Promise<void>>,
  notices: [] as unknown[],
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
  deletionNoticeSender: () => (notice: DeletionNotice) => {
    holder.notices.push(notice);
    return Promise.resolve();
  },
}));

let world: DeletionWorld;

beforeEach(async () => {
  holder.tasks.length = 0;
  holder.notices.length = 0;
  world = await deletionWorld();
  holder.db = world.db;
});

const deleteAccount = (body: unknown, cookie = world.cookie) =>
  callAccount("DELETE", "/api/account", { cookie, body });

async function drain(): Promise<void> {
  for (const task of holder.tasks.splice(0)) await task();
}

async function deletedAt(userId: string): Promise<Date | null> {
  const { rows } = await world.db.query<{ deleted_at: Date | null }>(
    "SELECT deleted_at FROM users WHERE id = $1",
    [userId],
  );
  return rows[0]?.deleted_at ?? null;
}

describe("DELETE /api/account", () => {
  it("schedules the deletion, ends every session, clears the cookie and mails a notice after", async () => {
    const { db, owner } = world;
    const elsewhere = await createSession(db, owner.id, Date.now());
    const response = await deleteAccount({
      confirmText: WORKSPACE_NAME,
      currentPassword: PASSWORD,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toMatch(/squint_session=;.*Max-Age=0/i);
    expect(await readSession(db, elsewhere, Date.now())).toBeNull();
    expect(await deletedAt(owner.id)).not.toBeNull();

    expect(holder.notices).toEqual([]);
    await drain();
    expect(holder.notices).toEqual([
      {
        to: OWNER_EMAIL,
        deleteAfter: expect.any(Number) as unknown,
        workspaceName: WORKSPACE_NAME,
      },
    ]);
  });

  it("refuses a body without the fields it needs", async () => {
    for (const body of [{}, { confirmText: WORKSPACE_NAME }, { currentPassword: PASSWORD }]) {
      expect((await deleteAccount(body)).status).toBe(400);
    }
    expect(await deletedAt(world.owner.id)).toBeNull();
  });

  it("refuses the admin's account with a 403 and no password check", async () => {
    const adminId = await insertUser(world.db, "admin@squint.test", "admin");
    const cookie = `squint_session=${await createSession(world.db, adminId, Date.now())}`;
    const response = await deleteAccount(
      { confirmText: "anything", currentPassword: PASSWORD },
      cookie,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "admin-account" });
    expect(await deletedAt(adminId)).toBeNull();
    expect(await countRows(world.db, "login_attempts", "email", "admin@squint.test")).toBe(0);
  });

  it("answers 404 for an account without an open workspace", async () => {
    await world.db.query("UPDATE workspaces SET archived_at = now() WHERE id = $1", [
      world.workspaceId,
    ]);
    const response = await deleteAccount({
      confirmText: WORKSPACE_NAME,
      currentPassword: PASSWORD,
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not-found" });
  });

  it("answers 409 to an owner whose workspace has other members", async () => {
    await addMember(world.db, world.workspaceId, "bo@acme.test");
    const response = await deleteAccount({
      confirmText: WORKSPACE_NAME,
      currentPassword: PASSWORD,
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "owner-has-members" });
    expect(await deletedAt(world.owner.id)).toBeNull();
  });

  it("answers 422 for another workspace's name, whatever ids the body names, and changes nothing", async () => {
    const { db, other } = world;
    const response = await deleteAccount({
      confirmText: "bravo",
      currentPassword: PASSWORD,
      workspaceId: other.workspaceId,
      userId: other.userId,
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "confirm-mismatch" });
    expect(await deletedAt(world.owner.id)).toBeNull();
    expect(await deletedAt(other.userId)).toBeNull();
    expect(await countRows(db, "login_attempts", "email", OWNER_EMAIL)).toBe(0);
    const { rows } = await db.query("SELECT 1 FROM workspaces WHERE delete_after IS NOT NULL");
    expect(rows).toEqual([]);
  });

  it("answers 422 for a wrong password, then 429 once the sign-in budget is spent", async () => {
    const wrong = { confirmText: WORKSPACE_NAME, currentPassword: "not my password" };
    for (let attempt = 0; attempt < MAX_FAILURES_PER_EMAIL; attempt += 1) {
      const response = await deleteAccount(wrong);
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "wrong-password" });
    }
    const locked = await deleteAccount({ confirmText: WORKSPACE_NAME, currentPassword: PASSWORD });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await deletedAt(world.owner.id)).toBeNull();
  });

  it("answers 401 to a second request once the first has signed the account out", async () => {
    const body = { confirmText: WORKSPACE_NAME, currentPassword: PASSWORD };
    expect((await deleteAccount(body)).status).toBe(200);
    expect((await deleteAccount(body)).status).toBe(401);
  });
});
