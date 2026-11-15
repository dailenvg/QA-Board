import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { migratedPglite } from "@/test/pglite";
import {
  addFolder,
  memberSeat,
  PAGES_PROJECT,
  PNG,
  seat,
  URL_PROJECT,
  type Seat,
} from "@/test/workspace-fixture";
import { call } from "@/test/workspace-routes";
import type { Database } from "../db/database";
import { ABANDON_WINDOW_MS } from "./projects";

/**
 * Undoing a page project whose pictures didn't upload (the browser's cleanup
 * in `createPagesProject`): any member may, trash switch or not, because only
 * a new project with nothing in it goes. Anything else stays.
 */

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

let db: Database;
let owner: Seat;
let member: Seat;

beforeEach(async () => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  db = await migratedPglite();
  holder.db = db;
  owner = await seat(db, "acme");
  await addFolder(db, owner.workspaceId);
  // No switches at all: in particular, no trash.
  member = await memberSeat(db, owner.workspaceId, []);
});

const as = (who: Seat, method: string, route: string, body?: unknown) =>
  call(method, `/api/w/${owner.workspaceId}${route}`, { cookie: who.cookie, body });

async function live(id: string): Promise<boolean> {
  const { rows } = await db.query("SELECT 1 FROM projects WHERE id = $1", [id]);
  return rows.length === 1;
}

describe("POST /api/w/:workspaceId/projects/:projectId/abandon", () => {
  it("deletes a new page project with nothing in it for a member without trash", async () => {
    expect((await as(member, "POST", "/projects", PAGES_PROJECT("p1"))).status).toBe(201);
    // Trashing it is theirs to ask, and refused.
    expect((await as(member, "DELETE", "/projects/p1", {})).status).toBe(403);
    expect((await as(member, "POST", "/projects/p1/abandon", {})).status).toBe(204);
    expect(await live("p1")).toBe(false);
  });

  it("keeps a project once any of its pictures is stored, until that file is gone again", async () => {
    await as(member, "POST", "/projects", PAGES_PROJECT("p1"));
    const stored = await call("PUT", `/api/w/${owner.workspaceId}/projects/p1/blobs/page:page-1`, {
      cookie: member.cookie,
      body: PNG,
      headers: { "content-type": "image/png" },
    });
    expect(stored.status).toBeLessThan(300);
    expect((await as(member, "POST", "/projects/p1/abandon", {})).status).toBe(404);
    expect(await live("p1")).toBe(true);
    expect((await as(member, "DELETE", "/projects/p1/blobs/page:page-1", {})).status).toBeLessThan(
      300,
    );
    expect((await as(member, "POST", "/projects/p1/abandon", {})).status).toBe(204);
  });

  it("keeps a project with a comment, a website project, and one older than the window", async () => {
    await as(owner, "POST", "/projects", PAGES_PROJECT("p1"));
    const commented = await as(owner, "POST", "/projects/p1/comments", {
      id: "c1",
      x: 1,
      y: 1,
      body: "Looks good",
      author: "Ana",
      pageId: "page-1",
    });
    expect(commented.status).toBe(201);
    await as(owner, "POST", "/projects", URL_PROJECT("p2"));
    await as(owner, "POST", "/projects", PAGES_PROJECT("p3"));
    await db.query("UPDATE projects SET created_at = $2 WHERE id = $1", [
      "p3",
      new Date(Date.now() - ABANDON_WINDOW_MS - 1000),
    ]);
    for (const id of ["p1", "p2", "p3"]) {
      expect((await as(member, "POST", `/projects/${id}/abandon`, {})).status, id).toBe(404);
      expect(await live(id), id).toBe(true);
    }
  });

  it("never reaches another workspace's project", async () => {
    const other = await seat(db, "bravo");
    await addFolder(db, other.workspaceId);
    await call("POST", `/api/w/${other.workspaceId}/projects`, {
      cookie: other.cookie,
      body: PAGES_PROJECT("p9"),
    });
    expect((await as(owner, "POST", "/projects/p9/abandon", {})).status).toBe(404);
    expect(await live("p9")).toBe(true);
  });
});
