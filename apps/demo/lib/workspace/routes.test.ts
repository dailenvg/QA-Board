import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import {
  addFolder,
  NOW,
  PAGES_PROJECT,
  PNG,
  TEST_AUTH_SECRET,
  twoWorkspaces,
  URL_PROJECT,
  type Seat,
} from "@/test/workspace-fixture";
import { call, ENDPOINTS, fill, ORIGIN } from "@/test/workspace-routes";
import type { Database } from "../db/database";
import { STATE } from "@/test/share-fixture";
import { inlineBackend } from "../share/blob-backend";
import { createPostgresStore } from "../share/postgres-store";
import { createShare } from "../share/service";
import { createProject } from "./projects";

const HOUR = 60 * 60 * 1000;

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

let db: Database;
let a: Seat;
let b: Seat;

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  ({ db, a, b } = await twoWorkspaces());
  holder.db = db;
  await addFolder(db, a.workspaceId);
  await createProject(db, a.workspaceId, PAGES_PROJECT("p1"), NOW);
});

const IDS = {
  folderId: "f1",
  projectId: "p1",
  snapshotId: "s1",
  commentId: "c1",
  key: "page:page-1",
};
const path = (workspaceId: string, route: string) => `/api/w/${workspaceId}${fill(route, IDS)}`;

describe("every workspace route", () => {
  it.each(ENDPOINTS)("$method $route answers 401 without a session", async ({ method, route }) => {
    const response = await call(method, path(a.workspaceId, route), { body: {} });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  it.each(ENDPOINTS)(
    "$method $route answers 401 for an unknown session",
    async ({ method, route }) => {
      const cookie = `squint_session=${"x".repeat(43)}`;
      const response = await call(method, path(a.workspaceId, route), { cookie, body: {} });
      expect(response.status).toBe(401);
    },
  );

  it.each(ENDPOINTS)(
    "$method $route answers 404 for a workspace the session isn't a member of",
    async ({ method, route }) => {
      for (const workspaceId of [a.workspaceId, crypto.randomUUID(), "not-a-uuid"]) {
        const response = await call(method, path(workspaceId, route), {
          cookie: b.cookie,
          body: {},
        });
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "not-found" });
      }
    },
  );

  const writes = ENDPOINTS.filter(({ method }) => method !== "GET");

  it.each(writes)("$method $route refuses another site's Origin", async ({ method, route }) => {
    const response = await call(method, path(a.workspaceId, route), {
      cookie: a.cookie,
      body: {},
      headers: { origin: "https://evil.test" },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "cross-site" });
  });

  it.each(writes)(
    "$method $route refuses a form-encodable body type",
    async ({ method, route }) => {
      const response = await call(method, path(a.workspaceId, route), {
        cookie: a.cookie,
        body: "name=x",
        headers: { "content-type": "text/plain" },
      });
      expect(response.status).toBe(415);
    },
  );

  it("disables caching on what it answers", async () => {
    const response = await call("GET", path(a.workspaceId, "/snapshot"), { cookie: a.cookie });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("request bodies", () => {
  const bodies: Array<[string, string, unknown, string]> = [
    ["POST", "/folders", { id: "../x", name: "X" }, "id"],
    ["PATCH", "/folders/f1", {}, "body"],
    [
      "POST",
      "/projects",
      { id: "p9", folderId: "f1", name: "X", source: { kind: "url", url: "javascript:alert(1)" } },
      "source.url",
    ],
    ["PATCH", "/projects/p1", { name: " " }, "name"],
    ["PUT", "/projects/p1/archive", { archived: "yes" }, "archived"],
    ["PUT", "/projects/p1/label", { label: "x".repeat(41) }, "label"],
    ["PUT", "/projects/p1/pages", { pages: [] }, "pages"],
    ["POST", "/projects/p1/snapshots", { id: "s1" }, "width"],
    ["POST", "/projects/p1/comments", { id: "c1", x: 101, y: 0, body: "Hi", author: "A" }, "x"],
    ["PATCH", "/projects/p1/comments/c1", { status: "deleted" }, "status"],
    [
      "PUT",
      "/projects/p1/share-link",
      { shareId: "s", token: "short", ownerKey: "short" },
      "token",
    ],
    ["PATCH", "/projects/p1/share-link", { cursor: -1, lastSyncedAt: 1 }, "cursor"],
    ["PATCH", "/projects/p1/share-link/settings", { reviewWindow: "48h" }, "reviewWindow"],
    ["PATCH", "/projects/p1/share-link/settings", { reviewWindow: 24 }, "reviewWindow"],
    ["PATCH", "/projects/p1/share-link/settings", {}, "reviewWindow"],
    ["POST", "/blobs/commit", { projectId: "p1", key: "../../etc" }, "key"],
    ["POST", "/blobs/token", { type: "blob.other" }, "type"],
    ["POST", "/import", { folders: [] }, "projects"],
    ["PUT", "/author", { name: "" }, "name"],
  ];

  it.each(bodies)(
    "%s %s answers 400 with the field zod refused",
    async (method, route, body, field) => {
      const response = await call(method, path(a.workspaceId, route), { cookie: a.cookie, body });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid", field });
    },
  );

  it("answers 400 for a body that isn't JSON, and 413 for one too big", async () => {
    const bad = await call("POST", path(a.workspaceId, "/folders"), {
      cookie: a.cookie,
      body: "{",
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "invalid-json" });
    const big = await call("POST", path(a.workspaceId, "/folders"), {
      cookie: a.cookie,
      body: JSON.stringify({ id: "f9", name: "x".repeat(2 * 1024 * 1024) }),
    });
    expect(big.status).toBe(413);
  });
});

describe("happy paths", () => {
  it("creates, reads, comments on, uploads to and trashes a project", async () => {
    const cookie = a.cookie;
    const at = (route: string) => `/api/w/${a.workspaceId}${route}`;
    const created = await call("POST", at("/projects"), {
      cookie,
      body: {
        id: "p2",
        folderId: "f1",
        name: "Site",
        source: { kind: "url", url: "https://a.test/" },
      },
    });
    expect(created.status).toBe(201);
    const snapshot = {
      id: "s1",
      width: 1280,
      height: 2000,
      createdAt: NOW,
      blobKey: "snapshot:s1",
      sourceUrl: "https://a.test/",
    };
    expect(
      (await call("POST", at("/projects/p2/snapshots"), { cookie, body: snapshot })).status,
    ).toBe(201);
    const comment = { id: "c1", x: 5, y: 5, body: "Hi", author: "Ana", snapshotId: "s1" };
    expect(
      (await call("POST", at("/projects/p2/comments"), { cookie, body: comment })).status,
    ).toBe(201);
    expect(
      (await call("POST", at("/projects/p2/comments"), { cookie, body: comment })).status,
    ).toBe(409);

    const upload = await call("PUT", at("/projects/p2/blobs/snapshot%3As1"), {
      cookie,
      body: PNG,
      headers: { "content-type": "image/png" },
    });
    expect(upload.status).toBe(201);
    const image = await call("GET", at("/projects/p2/blobs/snapshot:s1"), { cookie });
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG);

    const data = (await (await call("GET", at("/snapshot"), { cookie })).json()) as {
      projects: Array<{ id: string }>;
      comments: Array<{ id: string }>;
    };
    expect(data.projects.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
    expect(data.comments.map((c) => c.id)).toEqual(["c1"]);

    expect((await call("DELETE", at("/projects/p2"), { cookie })).status).toBe(204);
    expect((await call("GET", at("/projects/p2"), { cookie })).status).toBe(404);
    expect((await call("GET", at("/projects/p2/blobs/snapshot:s1"), { cookie })).status).toBe(404);
    expect((await call("POST", at("/projects/p2/restore"), { cookie, body: {} })).status).toBe(200);
    expect((await call("GET", at("/projects/p2/comments"), { cookie })).status).toBe(200);
  });

  it("refuses a client-upload token without Vercel Blob, and an inline upload of a non-image", async () => {
    const at = (route: string) => `/api/w/${a.workspaceId}${route}`;
    const token = await call("POST", at("/blobs/token"), {
      cookie: a.cookie,
      body: {
        type: "blob.generate-client-token",
        payload: { pathname: "x", clientPayload: null, multipart: false },
      },
    });
    expect(token.status).toBe(409);
    expect(await token.json()).toEqual({ error: "inline-uploads" });
    const text = await call("PUT", at("/projects/p1/blobs/page:page-1"), {
      cookie: a.cookie,
      body: new Uint8Array([1, 2, 3]),
      headers: { "content-type": "application/octet-stream" },
    });
    expect(text.status).toBe(415);
  });

  it("deletes a folder, keeping a trashed project inside restorable at the root", async () => {
    const cookie = a.cookie;
    const at = (route: string) => `/api/w/${a.workspaceId}${route}`;
    await call("POST", at("/folders"), { cookie, body: { id: "old", name: "Old work" } });
    const site = { kind: "url", url: "https://a.test/" };
    for (const id of ["kept", "binned"]) {
      await call("POST", at("/projects"), {
        cookie,
        body: { id, folderId: "old", name: id, source: site },
      });
    }
    expect((await call("DELETE", at("/projects/binned"), { cookie })).status).toBe(204);
    const refused = await call("DELETE", at("/folders/old"), { cookie });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "not-empty" });

    expect(
      (await call("PATCH", at("/projects/kept"), { cookie, body: { folderId: "f1" } })).status,
    ).toBe(200);
    expect((await call("DELETE", at("/folders/old"), { cookie })).status).toBe(204);
    const folders = (await (await call("GET", at("/folders"), { cookie })).json()) as Array<{
      id: string;
    }>;
    expect(folders.map((folder) => folder.id)).toEqual(["f1"]);
    const trash = (await (await call("GET", at("/projects?trash=1"), { cookie })).json()) as Array<{
      id: string;
      folderId: string | null;
    }>;
    expect(trash).toMatchObject([{ id: "binned", folderId: null }]);
    const restored = await call("POST", at("/projects/binned/restore"), { cookie, body: {} });
    expect(await restored.json()).toMatchObject({ id: "binned", folderId: null });
  });

  it("attaches a link as its inviter with the chosen window, then changes the window and audits it", async () => {
    vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
    const created = await createShare(
      { store: createPostgresStore(db), blobs: inlineBackend },
      STATE,
      NOW,
    );
    const link = `/api/w/${a.workspaceId}/projects/p1/share-link`;
    const proof = { shareId: created.shareId, token: created.token, ownerKey: created.ownerKey };
    const attached = await call("PUT", link, {
      cookie: a.cookie,
      body: { ...proof, reviewWindow: "24h" },
    });
    expect(await attached.json()).toMatchObject({
      id: created.shareId,
      reviewWindowHours: 24,
      reviewEndsAt: NOW + 24 * HOUR,
    });
    const { rows: shares } = await db.query("SELECT invited_by_user_id FROM squint_shares");
    expect(shares).toEqual([{ invited_by_user_id: a.userId }]);

    const changed = await call("PATCH", `${link}/settings`, {
      cookie: a.cookie,
      body: { reviewWindow: "none" },
    });
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual({ reviewWindowHours: null, reviewEndsAt: null });
    const { rows: entries } = await db.query("SELECT action, target_id, meta FROM audit_log");
    expect(entries).toEqual([
      {
        action: "share.settings_changed",
        target_id: "p1",
        meta: { fields: ["reviewWindow"], reviewWindow: "none" },
      },
    ]);
    // Without a link, there's nothing to set.
    await createProject(db, a.workspaceId, URL_PROJECT("p2"), NOW);
    const unlinked = await call(
      "PATCH",
      `/api/w/${a.workspaceId}/projects/p2/share-link/settings`,
      {
        cookie: a.cookie,
        body: { reviewWindow: "7d" },
      },
    );
    expect(unlinked.status).toBe(404);
  });

  it("sets and reads the member's author name", async () => {
    const at = `/api/w/${a.workspaceId}/author`;
    expect(await (await call("GET", at, { cookie: a.cookie })).json()).toEqual({ name: null });
    await call("PUT", at, { cookie: a.cookie, body: { name: "Ana" } });
    expect(await (await call("GET", at, { cookie: a.cookie })).json()).toEqual({ name: "Ana" });
  });

  it("answers a storage failure with a JSON 500 that logs no message", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = Object.assign(new Error("duplicate key ana@acme.test"), { code: "XX000" });
    holder.db = {
      query: (text, params) =>
        text.includes("FROM folders") ? Promise.reject(failing) : db.query(text, params),
      transaction: (run) => db.transaction(run),
    } satisfies Database;
    const response = await call("GET", `/api/w/${a.workspaceId}/folders`, { cookie: a.cookie });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "storage" });
    expect(error).toHaveBeenCalledWith("squint workspace: storage failed (Error XX000)");
  });
});

describe("Origin checks", () => {
  it("lets a same-site write through, and one without Origin (not a browser)", async () => {
    const at = `/api/w/${a.workspaceId}/folders`;
    const same = await call("POST", at, {
      cookie: a.cookie,
      body: { id: "f2", name: "Two" },
      headers: { origin: ORIGIN },
    });
    expect(same.status).toBe(201);
    const bare = await call("POST", at, {
      cookie: a.cookie,
      body: { id: "f3", name: "Three" },
      headers: { origin: "" },
    });
    expect(bare.status).toBe(201);
  });
});
