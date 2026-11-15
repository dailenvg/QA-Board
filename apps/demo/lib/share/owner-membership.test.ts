import { beforeEach, describe, expect, it, vi } from "vitest";
import * as shareRoute from "@/app/api/shares/[shareId]/route";
import * as ownerBlobRoute from "@/app/api/shares/[shareId]/blobs/[key]/route";
import * as changesRoute from "@/app/api/shares/[shareId]/changes/route";
import * as manifestRoute from "@/app/api/shares/[shareId]/manifest/route";
import type * as DatabaseModule from "@/lib/db/database";
import type * as ShareServerModule from "@/lib/share/server";
import { migratedPglite } from "@/test/pglite";
import { PNG, STATE } from "@/test/share-fixture";
import {
  addFolder,
  memberSeat,
  seat,
  TEST_AUTH_SECRET,
  URL_PROJECT,
  type Seat,
} from "@/test/workspace-fixture";
import { call } from "@/test/workspace-routes";
import type { Database } from "../db/database";
import { inlineBackend } from "./blob-backend";
import { OWNER_KEY_HEADER } from "./http-headers";
import { createPostgresStore } from "./postgres-store";
import { createShare, type CreatedShare } from "./service";

/**
 * A5: every member's browser holds a workspace link's owner key, so the key
 * alone no longer opens its owner routes. The session must be a member of
 * the link's workspace, and revoking it needs the review-links switch.
 */

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

vi.mock("@/lib/share/server", async (importOriginal) => ({
  ...(await importOriginal<typeof ShareServerModule>()),
  shareServices: () =>
    Promise.resolve({ store: createPostgresStore(holder.db as Database), blobs: inlineBackend }),
}));

let db: Database;
let owner: Seat;
let outsider: Seat;
let ip = 0;

async function newShare(): Promise<CreatedShare> {
  return createShare({ store: createPostgresStore(db), blobs: inlineBackend }, STATE, Date.now());
}

/** Makes `created` project `projectId`'s link in the owner's workspace. */
async function attach(created: CreatedShare, projectId: string) {
  const { shareId, token, ownerKey } = created;
  const attached = await call(
    "PUT",
    `/api/w/${owner.workspaceId}/projects/${projectId}/share-link`,
    { cookie: owner.cookie, body: { shareId, token, ownerKey } },
  );
  expect(attached.status).toBe(200);
}

beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
  db = await migratedPglite();
  holder.db = db;
  owner = await seat(db, "acme");
  outsider = await seat(db, "bravo");
  await addFolder(db, owner.workspaceId);
  for (const id of ["p1", "p2", "p3"]) {
    await call("POST", `/api/w/${owner.workspaceId}/projects`, {
      cookie: owner.cookie,
      body: URL_PROJECT(id),
    });
  }
});

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

function request(path: string, init: RequestInit, cookie: string | null, ownerKey: string) {
  ip += 1;
  const headers = new Headers(init.headers);
  headers.set("x-forwarded-for", `192.0.2.${ip % 250}`);
  headers.set(OWNER_KEY_HEADER, ownerKey);
  if (cookie) headers.set("cookie", cookie);
  return new Request(`http://localhost${path}`, { ...init, headers });
}

/** All five owner handlers (blobs both ways), as `cookie`'s browser with the share's key. */
function ownerCalls(created: CreatedShare, cookie: string | null) {
  const id = created.shareId;
  const as = (path: string, init: RequestInit = {}) =>
    request(path, init, cookie, created.ownerKey);
  const push = JSON.stringify({ project: STATE.project, cursor: 0 });
  return {
    push: () =>
      shareRoute.PATCH(
        as(`/api/shares/${id}`, { method: "PATCH", body: push }),
        params({ shareId: id }),
      ),
    pull: () => changesRoute.GET(as(`/api/shares/${id}/changes?since=0`), params({ shareId: id })),
    manifest: () => manifestRoute.GET(as(`/api/shares/${id}/manifest`), params({ shareId: id })),
    upload: () =>
      ownerBlobRoute.PUT(
        as(`/api/shares/${id}/blobs/crop:c-1`, { method: "PUT", body: PNG }),
        params({ shareId: id, key: "crop:c-1" }),
      ),
    download: () =>
      ownerBlobRoute.GET(
        as(`/api/shares/${id}/blobs/crop:c-1`),
        params({ shareId: id, key: "crop:c-1" }),
      ),
    revoke: () =>
      shareRoute.DELETE(as(`/api/shares/${id}`, { method: "DELETE" }), params({ shareId: id })),
  };
}

async function statuses(calls: Record<string, () => Promise<Response>>) {
  const result: Record<string, number> = {};
  for (const [name, run] of Object.entries(calls)) result[name] = (await run()).status;
  return result;
}

const ALL_404 = {
  push: 404,
  pull: 404,
  manifest: 404,
  upload: 404,
  download: 404,
  revoke: 404,
};

describe("a workspace link's owner routes (A5)", () => {
  it("answer 404 to the key without a membership: signed out, another workspace, or removed", async () => {
    const created = await newShare();
    await attach(created, "p1");
    const removed = await memberSeat(db, owner.workspaceId);
    await db.query("DELETE FROM memberships WHERE user_id = $1", [removed.userId]);
    for (const cookie of [null, outsider.cookie, removed.cookie]) {
      expect(await statuses(ownerCalls(created, cookie)), String(cookie)).toEqual(ALL_404);
    }
    // Still the link: the owner syncs it.
    expect((await ownerCalls(created, owner.cookie).manifest()).status).toBe(200);
  });

  it("let a member without the review-links switch sync the link, but not revoke it", async () => {
    const created = await newShare();
    await attach(created, "p1");
    const member = await memberSeat(db, owner.workspaceId, ["trash", "import"]);
    const { revoke, ...sync } = ownerCalls(created, member.cookie);
    const answered = await statuses(sync);
    expect(Object.values(answered).every((status) => status < 300 || status === 404)).toBe(true);
    expect(answered).toMatchObject({ push: 200, pull: 200, manifest: 200, upload: 200 });
    const refused = await revoke();
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: "not-allowed", permission: "links.manage" });
    expect((await ownerCalls(created, owner.cookie).manifest()).status).toBe(200);
  });

  it("let the owner, and a member with the switch, revoke a workspace's link", async () => {
    const first = await newShare();
    const second = await newShare();
    await attach(first, "p1");
    await attach(second, "p2");
    const member = await memberSeat(db, owner.workspaceId, ["review_links"]);
    expect((await ownerCalls(first, owner.cookie).revoke()).status).toBe(204);
    expect((await ownerCalls(second, member.cookie).revoke()).status).toBe(204);
  });

  it("leave an anonymous share's routes to its key alone, revoke included", async () => {
    const created = await newShare();
    const member = await memberSeat(db, owner.workspaceId, []);
    expect((await ownerCalls(created, null).manifest()).status).toBe(200);
    expect((await ownerCalls(created, member.cookie).revoke()).status).toBe(204);
  });
});
