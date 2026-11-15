import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as permissionsRoute from "@/app/api/account/members/[userId]/permissions/route";
import * as memberRoute from "@/app/api/account/members/[userId]/route";
import type * as DatabaseModule from "@/lib/db/database";
import { NOW } from "@/test/accounts-fixture";
import {
  addMember,
  EMAIL_OFF,
  giveAvatar,
  membersWorld,
  switchesOf,
  type MembersWorld,
  type Person,
} from "@/test/members-fixture";
import { addFolder, PNG, URL_PROJECT } from "@/test/workspace-fixture";
import { call } from "@/test/workspace-routes";
import type { Database } from "../../db/database";
import { toDate } from "../times";
import { personKey } from "./person-key";

/**
 * Removing someone, changing a member's switches, and a member's avatar by
 * their key, as a browser calls them: who may, and what each answers.
 */

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

const ORIGIN = "http://localhost:3000";
let world: MembersWorld;
let ben: Person;

beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", EMAIL_OFF.AUTH_SECRET);
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  world = await membersWorld();
  holder.db = world.db;
  ben = await addMember(world.db, world.workspaceId, undefined, "ben@acme.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(method: string, path: string, cookie: string, body: unknown = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      host: "localhost:3000",
      origin: ORIGIN,
      "content-type": "application/json",
      cookie,
    },
    body: JSON.stringify(body),
  });
}

const params = (userId: string) => ({ params: Promise.resolve({ userId }) });

const removeAs = (who: Person, target: string) =>
  memberRoute.DELETE(
    request("DELETE", `/api/account/members/${target}`, who.cookie),
    params(target),
  );

const ALL_OFF = { reviewLinks: false, trash: false, import: false, people: false };

const switchAs = (who: Person, target: string, body: unknown) =>
  permissionsRoute.PATCH(
    request("PATCH", `/api/account/members/${target}/permissions`, who.cookie, body),
    params(target),
  );

async function auditOf(action: string) {
  const { rows } = await world.db.query<{
    actor_user_id: string;
    target_id: string;
    meta: unknown;
  }>("SELECT actor_user_id, target_id, meta FROM audit_log WHERE action = $1 ORDER BY id", [
    action,
  ]);
  return rows;
}

describe("DELETE /api/account/members/:userId", () => {
  it("removes as the owner, and signs the removed member out at once", async () => {
    const response = await removeAs(world.owner, ben.user.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const next = await call("GET", `/api/w/${world.workspaceId}/snapshot`, { cookie: ben.cookie });
    expect(next.status).toBe(401);
  });

  it("answers 404 once they're gone, and 409 leaving for one who deleted their account", async () => {
    await removeAs(world.owner, ben.user.id);
    expect((await removeAs(world.owner, ben.user.id)).status).toBe(404);
    expect((await removeAs(world.owner, "not-a-uuid")).status).toBe(404);
    const lea = await addMember(world.db, world.workspaceId);
    await world.db.query("UPDATE users SET deleted_at = $2, delete_after = $3 WHERE id = $1", [
      lea.user.id,
      toDate(NOW),
      toDate(NOW + 1000),
    ]);
    const leaving = await removeAs(world.owner, lea.user.id);
    expect(leaving.status).toBe(409);
    expect(await leaving.json()).toEqual({ error: "leaving" });
  });

  it("refuses the owner as target with owner-only, another manager and self with not-allowed", async () => {
    const manager = await addMember(world.db, world.workspaceId, ["people"]);
    const peer = await addMember(world.db, world.workspaceId, ["people"]);
    const owner = await removeAs(manager, world.owner.user.id);
    expect(owner.status).toBe(403);
    expect(await owner.json()).toEqual({ error: "owner-only" });
    for (const target of [peer, manager]) {
      const refused = await removeAs(manager, target.user.id);
      expect(refused.status).toBe(403);
      expect(await refused.json()).toEqual({
        error: "not-allowed",
        permission: "members.manage",
        protected: true,
      });
    }
    expect((await removeAs(manager, ben.user.id)).status).toBe(200);
  });

  it("refuses a member without people before anything, with not-allowed", async () => {
    const refused = await removeAs(ben, world.owner.user.id);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: "not-allowed", permission: "members.manage" });
  });
});

describe("PATCH /api/account/members/:userId/permissions", () => {
  it("sets all four as the owner, and records them before and after", async () => {
    const response = await switchAs(world.owner, ben.user.id, {
      ...ALL_OFF,
      trash: true,
      people: true,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ permissions: ["trash", "people"] });
    expect(await switchesOf(world.db, ben.user.id, world.workspaceId)).toEqual(["trash", "people"]);
    expect(await auditOf("membership.permissions_changed")).toEqual([
      {
        actor_user_id: world.owner.user.id,
        target_id: ben.user.id,
        meta: {
          fields: ["permissions"],
          before: ["review_links", "trash", "import"],
          after: ["trash", "people"],
        },
      },
    ]);
  });

  it("records nothing when nothing changes", async () => {
    const same = { reviewLinks: true, trash: true, import: true, people: false };
    expect((await switchAs(world.owner, ben.user.id, same)).status).toBe(200);
    expect(await auditOf("membership.permissions_changed")).toEqual([]);
  });

  it("refuses every member with owner-only, a manager included", async () => {
    const manager = await addMember(world.db, world.workspaceId, ["people"]);
    for (const who of [manager, ben]) {
      const refused = await switchAs(who, ben.user.id, ALL_OFF);
      expect(refused.status).toBe(403);
      expect(await refused.json()).toEqual({ error: "owner-only" });
    }
    expect(await switchesOf(world.db, ben.user.id, world.workspaceId)).toEqual([
      "review_links",
      "trash",
      "import",
    ]);
  });

  it("answers 409 for the owner's row and a leaving member, 404 for someone not here", async () => {
    const own = await switchAs(world.owner, world.owner.user.id, ALL_OFF);
    expect(own.status).toBe(409);
    expect(await own.json()).toEqual({ error: "owner" });
    await world.db.query("UPDATE users SET deleted_at = $2, delete_after = $3 WHERE id = $1", [
      ben.user.id,
      toDate(NOW),
      toDate(NOW + 1000),
    ]);
    const leaving = await switchAs(world.owner, ben.user.id, ALL_OFF);
    expect(leaving.status).toBe(409);
    expect(await leaving.json()).toEqual({ error: "leaving" });
    const elsewhere = await addMember(world.db, world.other.workspaceId);
    expect((await switchAs(world.owner, elsewhere.user.id, ALL_OFF)).status).toBe(404);
  });

  it("refuses a body without all four booleans", async () => {
    expect((await switchAs(world.owner, ben.user.id, { trash: true })).status).toBe(400);
  });

  it("binds the member's very next request: trash off answers not-allowed", async () => {
    const as = (method: string, route: string, body?: unknown) =>
      call(method, `/api/w/${world.workspaceId}${route}`, { cookie: ben.cookie, body });
    await addFolder(world.db, world.workspaceId);
    expect((await as("POST", "/projects", URL_PROJECT("p1"))).status).toBe(201);
    await switchAs(world.owner, ben.user.id, { ...ALL_OFF, reviewLinks: true, import: true });
    const refused = await as("DELETE", "/projects/p1", {});
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: "not-allowed", permission: "projects.trash" });
  });
});

describe("GET /api/w/:workspaceId/people/:personKey/avatar", () => {
  const avatarOf = (who: Person, workspaceId: string, key: string) =>
    call("GET", `/api/w/${workspaceId}/people/${key}/avatar?v=x`, { cookie: who.cookie });

  async function inlineAvatar(who: Person) {
    await giveAvatar(world.db, who.user.id);
    await world.db.query("UPDATE user_blobs SET blob_url = NULL, bytes = $2 WHERE user_id = $1", [
      who.user.id,
      PNG,
    ]);
  }

  it("serves a member's avatar to anyone in the same workspace", async () => {
    await inlineAvatar(ben);
    const response = await avatarOf(
      world.owner,
      world.workspaceId,
      personKey(world.workspaceId, ben.user.id),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("answers 404 for another workspace's key, a removed member, and without an avatar", async () => {
    await inlineAvatar(ben);
    const elsewhere = await addMember(world.db, world.other.workspaceId);
    await inlineAvatar(elsewhere);
    const foreign = personKey(world.other.workspaceId, elsewhere.user.id);
    expect((await avatarOf(world.owner, world.workspaceId, foreign)).status).toBe(404);
    // Ben's key in another workspace isn't his key here.
    expect(
      (
        await avatarOf(
          world.owner,
          world.workspaceId,
          personKey(world.other.workspaceId, ben.user.id),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await avatarOf(
          world.owner,
          world.workspaceId,
          personKey(world.workspaceId, world.owner.user.id),
        )
      ).status,
    ).toBe(404);
    await removeAs(world.owner, ben.user.id);
    expect(
      (await avatarOf(world.owner, world.workspaceId, personKey(world.workspaceId, ben.user.id)))
        .status,
    ).toBe(404);
  });

  it("answers 404 to someone outside the workspace, whatever the key", async () => {
    await inlineAvatar(ben);
    const key = personKey(world.workspaceId, ben.user.id);
    expect((await avatarOf(world.other.owner, world.workspaceId, key)).status).toBe(404);
  });
});

describe("personKey", () => {
  it("differs per workspace, never holds the user id, and is 22 characters", () => {
    const here = personKey(world.workspaceId, ben.user.id);
    const there = personKey(world.other.workspaceId, ben.user.id);
    expect(here).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(here).not.toBe(there);
    expect(here).not.toContain(ben.user.id.slice(0, 8));
  });
});
