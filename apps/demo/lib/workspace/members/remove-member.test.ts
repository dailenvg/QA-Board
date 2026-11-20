import { beforeEach, describe, expect, it } from "vitest";
import { NOW, PASSWORD } from "@/test/accounts-fixture";
import {
  addMember,
  membersWorld,
  switchesOf,
  type MembersWorld,
  type Person,
} from "@/test/members-fixture";
import {
  REMOVAL_GRACE_MS,
  restoreAccount,
  scheduleAccountDeletion,
} from "../../account/account-deletion";
import { createResetLink } from "../../auth/password-reset";
import type { Queryable } from "../../share/migrate";
import { toDate } from "../times";
import { removeMember, type RemoveOutcome } from "./remove-member";

let world: MembersWorld;
let ben: Person;

beforeEach(async () => {
  world = await membersWorld();
  ben = await addMember(world.db, world.workspaceId, ["review_links", "import"], "ben@acme.test");
});

const as = (actor: Person, workspaceId = world.workspaceId) => ({
  userId: actor.user.id,
  workspaceId,
});

const remove = (actor: Person, target: Person, now = NOW): Promise<RemoveOutcome> =>
  removeMember(world.db, as(actor), target.user.id, now);

/** A ClickUp connection of their own, and the workspace's from before 040, made by them. */
async function connectClickUp(db: Queryable, who: Person, workspaceId: string) {
  await db.query(
    `INSERT INTO user_clickup_connections (user_id, workspace_id, clickup_team_id,
       clickup_team_name, clickup_user_id, clickup_username, access_token_sealed)
     VALUES ($1, $2, 't1', 'Team', 'u1', 'ben', 'sealed')`,
    [who.user.id, workspaceId],
  );
  await db.query(
    `INSERT INTO workspace_clickup_connections (workspace_id, clickup_team_id, clickup_team_name,
       clickup_user_id, clickup_username, access_token_sealed, connected_by)
     VALUES ($1, 't1', 'Team', 'u1', 'ben', 'sealed', $2)`,
    [workspaceId, who.user.id],
  );
}

async function account(userId: string) {
  const { rows } = await world.db.query<{
    deleted_at: Date | null;
    delete_after: Date | null;
    removed_from: string | null;
    removed_permissions: string[] | null;
  }>(
    "SELECT deleted_at, delete_after, removed_from, removed_permissions FROM users WHERE id = $1",
    [userId],
  );
  return rows[0];
}

async function count(table: string, userId: string) {
  const { rows } = await world.db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM ${table} WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.count ?? 0;
}

describe("removeMember (4.5)", () => {
  it("takes them out at once and deletes the account in 24 hours, remembering their switches", async () => {
    await connectClickUp(world.db, ben, world.workspaceId);
    const link = await createResetLink(world.db, ben.user.id, {
      now: NOW,
      origin: new URL("https://squint.test"),
    });
    expect(link).not.toBeNull();
    expect(await remove(world.owner, ben)).toEqual({ ok: true });
    expect(await switchesOf(world.db, ben.user.id, world.workspaceId)).toBeNull();
    expect(await account(ben.user.id)).toEqual({
      deleted_at: toDate(NOW),
      delete_after: toDate(NOW + REMOVAL_GRACE_MS),
      removed_from: world.workspaceId,
      removed_permissions: ["review_links", "import"],
    });
    for (const table of ["sessions", "email_changes", "user_clickup_connections"]) {
      expect(await count(table, ben.user.id), table).toBe(0);
    }
    const { rows: links } = await world.db.query("SELECT 1 FROM verifications WHERE value = $1", [
      ben.user.id,
    ]);
    expect(links).toEqual([]);
    const { rows: legacy } = await world.db.query(
      "SELECT 1 FROM workspace_clickup_connections WHERE workspace_id = $1",
      [world.workspaceId],
    );
    expect(legacy).toEqual([]);
  });

  it("records it as done by whoever removed them, with field names only", async () => {
    await remove(world.owner, ben);
    const { rows } = await world.db.query<{
      actor_user_id: string;
      workspace_id: string;
      action: string;
      meta: { fields: string[] };
    }>(
      `SELECT actor_user_id, workspace_id, action, meta FROM audit_log
       WHERE target_id = $1 ORDER BY id`,
      [ben.user.id],
    );
    expect(
      rows.map(({ action, actor_user_id, workspace_id }) => [action, actor_user_id, workspace_id]),
    ).toEqual([
      ["membership.removed", world.owner.user.id, world.workspaceId],
      ["user.deletion_scheduled", world.owner.user.id, world.workspaceId],
    ]);
    expect(JSON.stringify(rows)).not.toContain("ben@acme.test");
  });

  it("leaves the workspace's other ClickUp connection and everyone else alone", async () => {
    const cleo = await addMember(world.db, world.workspaceId, undefined, "cleo@acme.test");
    await connectClickUp(world.db, cleo, world.workspaceId);
    await remove(world.owner, ben);
    expect(await count("user_clickup_connections", cleo.user.id)).toBe(1);
    expect(await count("sessions", cleo.user.id)).toBe(1);
    expect(await account(cleo.user.id)).toMatchObject({ deleted_at: null });
  });

  it("answers leaving for a member who deleted their own account first, changing nothing", async () => {
    await world.db.query("UPDATE users SET deleted_at = $2, delete_after = $3 WHERE id = $1", [
      ben.user.id,
      toDate(NOW),
      toDate(NOW + 30 * 24 * 3600 * 1000),
    ]);
    expect(await remove(world.owner, ben)).toEqual({ ok: false, reason: "leaving" });
    expect(await switchesOf(world.db, ben.user.id, world.workspaceId)).not.toBeNull();
    expect(await account(ben.user.id)).toMatchObject({ removed_from: null });
  });

  it("answers not-found once they're gone, for another workspace's member, and for nobody", async () => {
    expect(await remove(world.owner, ben)).toEqual({ ok: true });
    expect(await remove(world.owner, ben)).toEqual({ ok: false, reason: "not-found" });
    const elsewhere = await addMember(world.db, world.other.workspaceId);
    expect(await remove(world.owner, elsewhere)).toEqual({ ok: false, reason: "not-found" });
    expect(await switchesOf(world.db, elsewhere.user.id, world.other.workspaceId)).not.toBeNull();
    expect(
      await removeMember(world.db, as(world.owner), "00000000-0000-4000-8000-000000000009", NOW),
    ).toEqual({ ok: false, reason: "not-found" });
  });

  it("never removes the owner: owner-only, for the owner too", async () => {
    const manager = await addMember(world.db, world.workspaceId, ["people"]);
    expect(await remove(manager, world.owner)).toEqual({ ok: false, reason: "owner-only" });
    expect(await remove(world.owner, world.owner)).toEqual({ ok: false, reason: "owner-only" });
    expect(await account(world.owner.user.id)).toMatchObject({ deleted_at: null });
  });

  it("lets a member with people remove members without it, never themself or a peer (D1)", async () => {
    const manager = await addMember(world.db, world.workspaceId, ["people"]);
    const peer = await addMember(world.db, world.workspaceId, ["people", "trash"]);
    expect(await remove(manager, manager)).toEqual({ ok: false, reason: "protected" });
    expect(await remove(manager, peer)).toEqual({ ok: false, reason: "protected" });
    expect(await switchesOf(world.db, peer.user.id, world.workspaceId)).toEqual([
      "people",
      "trash",
    ]);
    expect(await remove(manager, ben)).toEqual({ ok: true });
    // Only the owner removes a manager.
    expect(await remove(world.owner, peer)).toEqual({ ok: true });
  });

  it("refuses a member without people, and one whose switch went off before the lock", async () => {
    const cleo = await addMember(world.db, world.workspaceId, ["review_links", "trash", "import"]);
    expect(await remove(cleo, ben)).toEqual({ ok: false, reason: "not-allowed" });
    const manager = await addMember(world.db, world.workspaceId, ["people"]);
    await world.db.query("UPDATE memberships SET permissions = '{}' WHERE user_id = $1", [
      manager.user.id,
    ]);
    expect(await remove(manager, ben)).toEqual({ ok: false, reason: "not-allowed" });
    expect(await switchesOf(world.db, ben.user.id, world.workspaceId)).not.toBeNull();
  });

  it("answers not-found once the workspace is closing, removing nobody", async () => {
    await world.db.query("UPDATE workspaces SET archived_at = now() WHERE id = $1", [
      world.workspaceId,
    ]);
    expect(await remove(world.owner, ben)).toEqual({ ok: false, reason: "not-found" });
    expect(await switchesOf(world.db, ben.user.id, world.workspaceId)).not.toBeNull();
  });

  it("lets the admin restore it within 24 hours only, clearing the removal", async () => {
    await remove(world.owner, ben);
    expect(await restoreAccount(world.db, ben.user.id, NOW + REMOVAL_GRACE_MS)).toEqual({
      ok: true,
      restored: null,
    });
    expect(await restoreAccount(world.db, ben.user.id, NOW + REMOVAL_GRACE_MS - 1)).toEqual({
      ok: true,
      restored: { newWorkspaceId: null },
    });
    expect(await account(ben.user.id)).toEqual({
      deleted_at: null,
      delete_after: null,
      removed_from: null,
      removed_permissions: null,
    });
  });

  it("finds the account already deleted when their own deletion came first", async () => {
    const deleted = await scheduleAccountDeletion(
      world.db,
      ben.user,
      { confirmText: "ben@acme.test", currentPassword: PASSWORD, ip: "203.0.113.4" },
      NOW,
    );
    expect(deleted).toMatchObject({ ok: true });
    expect(await remove(world.owner, ben, NOW + 1)).toEqual({ ok: false, reason: "leaving" });
  });
});
