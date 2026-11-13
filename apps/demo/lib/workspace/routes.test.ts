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
    ["PATCH", "/projects/p1/share-link/settings", {}, "body"],
    ["PATCH", "/projects/p1/share-link/settings", { clientName: "x".repeat(81) }, "clientName"],
    ["PATCH", "/projects/p1/share-link/settings", { clientName: 7 }, "clientName"],
    ["POST", "/projects/p1/share-link/invites", { addresses: [] }, "addresses"],
    [
      "POST",
      "/projects/p1/share-link/invites",
      { addresses: Array.from({ length: 11 }, (_, i) => `p${i}@a.test`) },
      "addresses",
    ],
    ["POST", "/projects/p1/share-link/invites", { addresses: "a@b.test" }, "addresses"],
    ["PUT", "/projects/p1/share-link/password", { password: "1234567" }, "password"],
    ["PUT", "/projects/p1/share-link/password", { password: "x".repeat(129) }, "password"],
    ["PUT", "/projects/p1/share-link/password", { password: 12345678 }, "password"],
    ["PUT", "/projects/p1/share-link/password", {}, "password"],
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
    expect(await changed.json()).toEqual({
      reviewWindowHours: null,
      reviewEndsAt: null,
      clientName: null,
    });
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

  it("names the link's client, then emails its invitation and counts who it reached", async () => {
    vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const created = await createShare(
      { store: createPostgresStore(db), blobs: inlineBackend },
      STATE,
      NOW,
    );
    const link = `/api/w/${a.workspaceId}/projects/p1/share-link`;
    const proof = { shareId: created.shareId, token: created.token, ownerKey: created.ownerKey };
    await call("PUT", link, { cookie: a.cookie, body: { ...proof, reviewWindow: "none" } });

    const named = await call("PATCH", `${link}/settings`, {
      cookie: a.cookie,
      body: { clientName: "  Bravo\nStudio  " },
    });
    expect(await named.json()).toEqual({
      reviewWindowHours: null,
      reviewEndsAt: null,
      clientName: "Bravo Studio",
    });
    const cleared = await call("PATCH", `${link}/settings`, {
      cookie: a.cookie,
      body: { clientName: " " },
    });
    expect(await cleared.json()).toMatchObject({ clientName: null });
    const { rows: entries } = await db.query("SELECT meta FROM audit_log ORDER BY id");
    // The field only: never the name.
    expect(entries).toEqual([
      { meta: { fields: ["clientName"] } },
      { meta: { fields: ["clientName"] } },
    ]);

    const invalid = await call("POST", `${link}/invites`, {
      cookie: a.cookie,
      body: { addresses: ["ana@bravo.test", "not an address"] },
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      error: "invalid-addresses",
      addresses: ["not an address"],
    });

    const sent = await call("POST", `${link}/invites`, {
      cookie: a.cookie,
      body: { addresses: ["Ana@Bravo.test", "ana@bravo.test ", "leo@bravo.test"] },
    });
    expect(sent.status).toBe(200);
    expect(await sent.json()).toEqual({ sent: 2, invitedCount: 2 });
    expect(warn).toHaveBeenCalledWith(
      "squint share: invite email skipped (RESEND_API_KEY or EMAIL_FROM not set)",
    );
    warn.mockRestore();

    const snapshot = await call("GET", `/api/w/${a.workspaceId}/snapshot`, { cookie: a.cookie });
    const data = (await snapshot.json()) as { projects: Array<{ share?: unknown }> };
    expect(data.projects[0]?.share).toMatchObject({ clientName: null, invitedCount: 2 });
  });

  it("holds invitations over the hour's limit with Retry-After, and refuses non-members on a preview", async () => {
    vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
    vi.stubEnv("RESEND_API_KEY", "");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const created = await createShare(
      { store: createPostgresStore(db), blobs: inlineBackend },
      STATE,
      NOW,
    );
    const link = `/api/w/${a.workspaceId}/projects/p1/share-link`;
    const proof = { shareId: created.shareId, token: created.token, ownerKey: created.ownerKey };
    await call("PUT", link, { cookie: a.cookie, body: { ...proof, reviewWindow: "none" } });

    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    const outside = await call("POST", `${link}/invites`, {
      cookie: a.cookie,
      body: { addresses: ["ana@bravo.test"] },
    });
    expect(outside.status).toBe(403);
    expect(await outside.json()).toEqual({ error: "members-only", addresses: ["ana@bravo.test"] });
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");

    const ten = Array.from({ length: 10 }, (_, index) => `p${index}@bravo.test`);
    for (let send = 0; send < 2; send += 1) {
      const ok = await call("POST", `${link}/invites`, {
        cookie: a.cookie,
        body: { addresses: ten },
      });
      expect(ok.status).toBe(200);
    }
    const limited = await call("POST", `${link}/invites`, {
      cookie: a.cookie,
      body: { addresses: ["late@bravo.test"] },
    });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(3500);
    expect(await limited.json()).toMatchObject({ error: "rate-limited" });

    // Without a link, there's nothing to send.
    await createProject(db, a.workspaceId, URL_PROJECT("p2"), NOW);
    const unlinked = await call("POST", `/api/w/${a.workspaceId}/projects/p2/share-link/invites`, {
      cookie: a.cookie,
      body: { addresses: ["ana@bravo.test"] },
    });
    expect(unlinked.status).toBe(404);
  });

  it("sets, changes and removes a link's password, never answering its hash, and audits it", async () => {
    vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
    const created = await createShare(
      { store: createPostgresStore(db), blobs: inlineBackend },
      STATE,
      NOW,
    );
    const link = `/api/w/${a.workspaceId}/projects/p1/share-link`;
    const proof = { shareId: created.shareId, token: created.token, ownerKey: created.ownerKey };
    const attached = await call("PUT", link, { cookie: a.cookie, body: proof });
    expect(await attached.json()).toMatchObject({ hasPassword: false, passwordSetAt: null });

    // 8 and 128 characters are both fine, spaces and all.
    for (const password of ["  8 char", "p".repeat(128)]) {
      const before = Date.now();
      const set = await call("PUT", `${link}/password`, { cookie: a.cookie, body: { password } });
      expect(set.status).toBe(200);
      const state = (await set.json()) as { hasPassword: boolean; passwordSetAt: number };
      expect(state).toEqual({ hasPassword: true, passwordSetAt: expect.any(Number) as number });
      expect(state.passwordSetAt).toBeGreaterThanOrEqual(before);
    }
    const read = await call("GET", link, { cookie: a.cookie });
    const body = await read.text();
    expect(JSON.parse(body)).toMatchObject({ hasPassword: true });
    const { rows: stored } = await db.query<{ password_hash: string }>(
      "SELECT password_hash FROM squint_shares",
    );
    expect(stored[0]?.password_hash).toMatch(/^\$argon2id\$/);
    expect(body).not.toContain(stored[0]?.password_hash ?? "$argon2id$");
    expect(body).not.toContain("argon2");

    const removed = await call("DELETE", `${link}/password`, { cookie: a.cookie, body: {} });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ hasPassword: false, passwordSetAt: null });
    expect(await (await call("GET", link, { cookie: a.cookie })).json()).toMatchObject({
      hasPassword: false,
      passwordSetAt: null,
    });
    const { rows: entries } = await db.query<{ action: string; meta: unknown }>(
      "SELECT action, target_id, meta FROM audit_log ORDER BY id",
    );
    expect(entries).toEqual([
      { action: "share.password_set", target_id: "p1", meta: { fields: ["password"] } },
      { action: "share.password_set", target_id: "p1", meta: { fields: ["password"] } },
      { action: "share.password_removed", target_id: "p1", meta: { fields: ["password"] } },
    ]);
    // Without a link, or in another workspace, there's nothing to protect.
    await createProject(db, a.workspaceId, URL_PROJECT("p2"), NOW);
    const unlinked = `/api/w/${a.workspaceId}/projects/p2/share-link/password`;
    const password = { password: "long enough" };
    expect((await call("PUT", unlinked, { cookie: a.cookie, body: password })).status).toBe(404);
    expect((await call("DELETE", unlinked, { cookie: a.cookie, body: {} })).status).toBe(404);
    const theirs = await call("PUT", `${link}/password`, { cookie: b.cookie, body: password });
    expect(theirs.status).toBe(404);
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
