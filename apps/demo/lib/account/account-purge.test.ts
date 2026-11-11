import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertUser, NOW, PASSWORD } from "@/test/accounts-fixture";
import {
  addMember,
  AVATAR_URL,
  closingMember,
  countRows,
  deletionWorld,
  MEMBER_EMAIL,
  OWNER_EMAIL,
  SHARE_FILE_URL,
  WORKSPACE_NAME,
  type DeletionWorld,
} from "@/test/deletion-fixture";
import { findOwnWorkspace } from "../auth/memberships";
import type { SessionUser } from "../auth/users";
import type { BlobLocation } from "../share/types";
import type { PurgeServices } from "../workspace/purge";
import {
  ACCOUNT_DELETION_GRACE_MS,
  restoreAccount,
  scheduleAccountDeletion,
} from "./account-deletion";
import { purgeDeletedAccounts, tombstoneEmail } from "./account-purge";

const IP = "203.0.113.9";
const DUE = NOW + ACCOUNT_DELETION_GRACE_MS;
const DEADLINE = Number.MAX_SAFE_INTEGER;

let world: DeletionWorld;

beforeEach(async () => {
  world = await deletionWorld();
});

/** Where each discarded file was: its URL, or "inline" for bytes kept in a row. */
function recordingServices(fail = false) {
  const discarded: string[] = [];
  const record = (locations: readonly BlobLocation[]) => {
    if (fail) return Promise.reject(new Error("blob store down"));
    for (const location of locations) {
      discarded.push(location.kind === "vercel" ? location.url : "inline");
    }
    return Promise.resolve();
  };
  const services = {
    shareBlobs: { discard: record },
    blobs: { kind: "inline", read: () => Promise.resolve(null), discard: record },
  } as unknown as PurgeServices;
  return { services, discarded };
}

const remove = (user: SessionUser, confirmText: string) =>
  scheduleAccountDeletion(world.db, user, { confirmText, currentPassword: PASSWORD, ip: IP }, NOW);

async function userRow(id: string) {
  const { rows } = await world.db.query<{
    email: string;
    name: string | null;
    avatar_blob_key: string | null;
    password_hash: string;
    deleted_at: Date | null;
    delete_after: Date | null;
  }>(
    `SELECT email, name, avatar_blob_key, password_hash, deleted_at, delete_after
     FROM users WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function purgeAudit() {
  const { rows } = await world.db.query<{ action: string; actor_user_id: string | null }>(
    "SELECT action, actor_user_id FROM audit_log WHERE action LIKE '%.deleted' ORDER BY id",
  );
  return rows;
}

describe("purgeDeletedAccounts", () => {
  it("deletes an owner's account and workspace for good once the date comes, files after", async () => {
    const { db, owner, workspaceId, other } = world;
    await db.query("UPDATE users SET name = 'Ana' WHERE id = $1", [owner.id]);
    await remove(owner, WORKSPACE_NAME);
    const { services, discarded } = recordingServices();

    expect(await purgeDeletedAccounts(db, services, DUE - 1, DEADLINE)).toEqual({
      count: 0,
      done: true,
    });
    expect(discarded).toEqual([]);

    expect(await purgeDeletedAccounts(db, services, DUE, DEADLINE)).toEqual({
      count: 1,
      done: true,
    });
    for (const table of [
      "workspaces",
      "projects",
      "folders",
      "workspace_blobs",
      "storage_usage",
      "squint_shares",
      "project_share_links",
      "memberships",
    ]) {
      const column = table === "workspaces" ? "id" : "workspace_id";
      expect(await countRows(db, table, column, workspaceId)).toBe(0);
    }
    expect(await countRows(db, "user_blobs", "user_id", owner.id)).toBe(0);
    // The share's file, the project's file and the logo (both inline), then the avatar.
    expect(discarded.sort()).toEqual([AVATAR_URL, SHARE_FILE_URL, "inline", "inline"].sort());

    const scrubbed = await userRow(owner.id);
    expect(scrubbed).toMatchObject({
      email: tombstoneEmail(owner.id),
      name: null,
      avatar_blob_key: null,
      delete_after: null,
    });
    expect(scrubbed?.deleted_at).not.toBeNull();
    expect(scrubbed?.password_hash).not.toMatch(/^\$argon2/);
    expect(await purgeAudit()).toEqual([
      { action: "workspace.deleted", actor_user_id: null },
      { action: "user.deleted", actor_user_id: null },
    ]);
    const { rows: logged } = await db.query<{ workspace_id: string }>(
      "SELECT workspace_id FROM audit_log WHERE action = 'workspace.deleted'",
    );
    expect(logged).toEqual([{ workspace_id: workspaceId }]);

    // Its email and slug are free again; the other workspace never changed.
    await insertUser(db, OWNER_EMAIL);
    await db.query("INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme again')");
    expect(await countRows(db, "projects", "workspace_id", other.workspaceId)).toBe(0);
    expect(await countRows(db, "memberships", "workspace_id", other.workspaceId)).toBe(1);
  });

  it("changes nothing when it runs again", async () => {
    const { db, owner } = world;
    await remove(owner, WORKSPACE_NAME);
    const { services } = recordingServices();
    await purgeDeletedAccounts(db, services, DUE, DEADLINE);
    const { services: again, discarded } = recordingServices();
    expect(await purgeDeletedAccounts(db, again, DUE + 1, DEADLINE)).toEqual({
      count: 0,
      done: true,
    });
    expect(discarded).toEqual([]);
    expect(await purgeAudit()).toHaveLength(2);
  });

  it("removes a member from the workspace and keeps their comments, under their name", async () => {
    const { db, workspaceId } = world;
    const memberId = await addMember(db, workspaceId, "bo@acme.test");
    await db.query(
      `INSERT INTO comments (project_id, id, x, y, body, author_name, author_user_id)
       VALUES ('p1', 'c1', 0.5, 0.5, 'Tighten this', 'Bo', $1)`,
      [memberId],
    );
    const member: SessionUser = {
      id: memberId,
      email: "bo@acme.test",
      name: null,
      role: "company",
    };
    await remove(member, "bo@acme.test");
    const { services } = recordingServices();
    expect(await purgeDeletedAccounts(db, services, DUE, DEADLINE)).toEqual({
      count: 1,
      done: true,
    });
    expect(await countRows(db, "memberships", "user_id", memberId)).toBe(0);
    expect(await countRows(db, "projects", "workspace_id", workspaceId)).toBe(1);
    const { rows } = await db.query("SELECT author_name, author_user_id, origin FROM comments");
    expect(rows).toEqual([{ author_name: "Bo", author_user_id: memberId, origin: "team" }]);
  });

  it("deletes the workspace a restored member left, and neither them nor their new one", async () => {
    const { db, owner, workspaceId } = world;
    const member = await closingMember(world, NOW);
    const restored = await restoreAccount(db, member.id, NOW + 1, null, {
      name: "Bo Studio",
      slug: "bo-studio",
    });
    const newWorkspaceId = (restored.ok && restored.restored?.newWorkspaceId) || "";
    const { services } = recordingServices();

    expect(await purgeDeletedAccounts(db, services, DUE, DEADLINE)).toEqual({
      count: 1,
      done: true,
    });
    expect(await countRows(db, "workspaces", "id", workspaceId)).toBe(0);
    expect((await userRow(owner.id))?.email).toBe(tombstoneEmail(owner.id));
    expect(await userRow(member.id)).toMatchObject({
      email: MEMBER_EMAIL,
      deleted_at: null,
      delete_after: null,
    });
    expect(await findOwnWorkspace(db, member.id)).toMatchObject({
      workspaceId: newWorkspaceId,
      role: "owner",
    });
    expect(await countRows(db, "storage_usage", "workspace_id", newWorkspaceId)).toBe(1);
    expect(await purgeAudit()).toEqual([
      { action: "workspace.deleted", actor_user_id: null },
      { action: "user.deleted", actor_user_id: null },
    ]);
  });

  it("keeps a due account that still owns an open workspace, says so, and deletes it once that's resolved", async () => {
    const { db, owner, workspaceId } = world;
    await remove(owner, WORKSPACE_NAME);
    // The workspace restored by hand, without its owner.
    await db.query("UPDATE workspaces SET delete_after = NULL WHERE id = $1", [workspaceId]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { services, discarded } = recordingServices();

    expect(await purgeDeletedAccounts(db, services, DUE, DEADLINE)).toEqual({
      count: 0,
      done: true,
    });
    const kept = await userRow(owner.id);
    expect(kept?.email).toBe(OWNER_EMAIL);
    expect(kept?.delete_after).not.toBeNull();
    expect(await countRows(db, "memberships", "user_id", owner.id)).toBe(1);
    expect(await countRows(db, "user_blobs", "user_id", owner.id)).toBe(1);
    expect(discarded).toEqual([]);
    expect(await purgeAudit()).toEqual([]);
    expect(warn.mock.calls).toEqual([
      ["squint purge: 1 due account(s) kept: they still own an open workspace"],
    ]);

    // Resolved: the workspace is due again, and the next run deletes both.
    warn.mockClear();
    await db.query("UPDATE workspaces SET delete_after = $2 WHERE id = $1", [
      workspaceId,
      new Date(DUE),
    ]);
    expect(await purgeDeletedAccounts(db, services, DUE, DEADLINE)).toEqual({
      count: 1,
      done: true,
    });
    expect((await userRow(owner.id))?.email).toBe(tombstoneEmail(owner.id));
    expect(await countRows(db, "workspaces", "id", workspaceId)).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps an account restored before the cron reached it", async () => {
    const { db, owner, workspaceId } = world;
    await remove(owner, WORKSPACE_NAME);
    await db.query("UPDATE users SET deleted_at = NULL, delete_after = NULL WHERE id = $1", [
      owner.id,
    ]);
    await db.query("UPDATE workspaces SET delete_after = NULL WHERE id = $1", [workspaceId]);
    const { services } = recordingServices();
    expect(await purgeDeletedAccounts(db, services, DUE, DEADLINE)).toEqual({
      count: 0,
      done: true,
    });
    expect((await userRow(owner.id))?.email).toBe(OWNER_EMAIL);
  });

  it("finishes the database work when the file store fails, leaving the files to the sweep", async () => {
    const { db, owner, workspaceId } = world;
    await remove(owner, WORKSPACE_NAME);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { services } = recordingServices(true);
    expect(await purgeDeletedAccounts(db, services, DUE, DEADLINE)).toEqual({
      count: 1,
      done: true,
    });
    expect(await countRows(db, "workspaces", "id", workspaceId)).toBe(0);
    expect((await userRow(owner.id))?.email).toBe(tombstoneEmail(owner.id));
    expect(errors.mock.calls.flat().join("\n")).not.toMatch(/blob store down|https?:/);
    expect(errors).toHaveBeenCalledWith("squint purge: avatar files left for the sweep (Error)");
  });

  it("stops at the deadline and leaves the rest for the next run", async () => {
    const { db, owner } = world;
    await remove(owner, WORKSPACE_NAME);
    const { services } = recordingServices();
    expect(await purgeDeletedAccounts(db, services, DUE, 0)).toEqual({ count: 0, done: false });
    expect((await userRow(owner.id))?.email).toBe(OWNER_EMAIL);
  });
});
