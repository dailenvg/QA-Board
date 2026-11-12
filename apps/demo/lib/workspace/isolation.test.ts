import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import type * as ShareServerModule from "@/lib/share/server";
import type * as BlobDriverModule from "@/lib/workspace/blob-driver";
import { STATE } from "@/test/share-fixture";
import {
  addFolder,
  NOW,
  PAGES_PROJECT,
  PNG,
  twoWorkspaces,
  URL_PROJECT,
  type Seat,
} from "@/test/workspace-fixture";
import { call } from "@/test/workspace-routes";
import type { Database } from "../db/database";
import { findMembership } from "../auth/memberships";
import { inlineBackend } from "../share/blob-backend";
import { createPostgresStore } from "../share/postgres-store";
import { createShare } from "../share/service";
import type { AnyBlobDriver, ClientUploadDriver } from "./blob-driver";
import { blobPath } from "./blob-paths";
import { loadWorkspace } from "./load-workspace";

/**
 * Workspace B, signed in, aims every route at workspace A's things: by A's
 * workspace id (B isn't a member) and by A's ids under B's own workspace id.
 * Every attempt answers 404, and A's data is the same afterwards.
 */

const holder = vi.hoisted(() => ({
  db: null as Database | null,
  driver: null as AnyBlobDriver | null,
}));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

vi.mock("@/lib/share/server", async (importOriginal) => ({
  ...(await importOriginal<typeof ShareServerModule>()),
  shareServices: () =>
    Promise.resolve({ store: createPostgresStore(holder.db as Database), blobs: inlineBackend }),
}));

vi.mock("@/lib/workspace/blob-driver", async (importOriginal) => {
  const actual = await importOriginal<typeof BlobDriverModule>();
  return { ...actual, blobDriverFromEnv: () => holder.driver ?? actual.blobDriverFromEnv() };
});

/** A Vercel Blob store where every path holds a small PNG (so only the database can say no). */
const anyFileStore: ClientUploadDriver = {
  kind: "vercel",
  read: () => Promise.resolve(PNG),
  discard: () => Promise.resolve(),
  head: (pathname) =>
    Promise.resolve({ url: `https://store.test/${pathname}`, size: 10, contentType: "image/png" }),
  handleUpload: () => Promise.resolve({ type: "blob.generate-client-token", clientToken: "t" }),
  list: () => Promise.resolve({ files: [], hasMore: false }),
};

let db: Database;
let a: Seat;
let b: Seat;
let share: { shareId: string; token: string; ownerKey: string };

/** Workspace A: a folder only it has, a page project and a website, each with something on it. */
beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-0123456789abcdef");
  ({ db, a, b } = await twoWorkspaces());
  holder.db = db;
  holder.driver = null;
  await addFolder(db, a.workspaceId, "f1");
  await addFolder(db, a.workspaceId, "a-only");
  await addFolder(db, b.workspaceId, "f1");
  const as = (method: string, route: string, body?: unknown, headers?: Record<string, string>) =>
    call(method, `/api/w/${a.workspaceId}${route}`, { cookie: a.cookie, body, headers });
  await as("POST", "/projects", PAGES_PROJECT("deck"));
  await as("POST", "/projects", URL_PROJECT("web"));
  await as("POST", "/projects/web/snapshots", {
    id: "s1",
    width: 1280,
    height: 2000,
    createdAt: NOW,
    blobKey: "snapshot:s1",
    sourceUrl: "https://acme.example/",
  });
  await as("POST", "/projects/deck/comments", {
    id: "c1",
    x: 1,
    y: 1,
    body: "A's comment",
    author: "Ana",
    pageId: "page-1",
  });
  await as("PUT", "/projects/deck/blobs/page:page-1", PNG, { "content-type": "image/png" });
  const created = await createShare(
    { store: createPostgresStore(db), blobs: inlineBackend },
    STATE,
    NOW,
  );
  share = { shareId: created.shareId, token: created.token, ownerKey: created.ownerKey };
  expect((await as("PUT", "/projects/deck/share-link", share)).status).toBe(200);
});

async function aData() {
  const membership = await findMembership(db, a.userId, a.workspaceId);
  if (!membership) throw new Error("no membership");
  const data = await loadWorkspace(db, membership, a.userId);
  const { rows } = await db.query(
    "SELECT workspace_id, key, size FROM workspace_blobs ORDER BY key",
  );
  return { data, blobs: rows };
}

/** Everything B might try against A's things: method, route under a workspace, body. */
function attempts(): Array<[string, string, unknown?]> {
  const comment = { id: "c9", x: 1, y: 1, body: "B was here", author: "B", pageId: "page-1" };
  const snapshot = {
    id: "s9",
    width: 1,
    height: 1,
    createdAt: NOW,
    blobKey: "snapshot:s9",
    sourceUrl: "https://acme.example/",
  };
  const pages = { pages: [{ id: "evil", blobKey: "page:evil", name: "Evil" }] };
  const upload = { projectId: "deck", key: "page:page-9", size: 10, contentType: "image/png" };
  return [
    ["PATCH", "/folders/a-only", { name: "Mine now" }],
    ["DELETE", "/folders/a-only"],
    ["GET", "/projects/deck"],
    ["PATCH", "/projects/deck", { name: "Mine now" }],
    ["DELETE", "/projects/deck"],
    ["POST", "/projects/deck/restore", {}],
    ["PUT", "/projects/deck/archive", { archived: true }],
    ["PUT", "/projects/deck/label", { label: "Mine" }],
    ["GET", "/projects/deck/pages"],
    ["PUT", "/projects/deck/pages", pages],
    ["GET", "/projects/web/snapshots"],
    ["POST", "/projects/web/snapshots", snapshot],
    ["DELETE", "/projects/web/snapshots/s1"],
    ["GET", "/projects/deck/comments"],
    ["POST", "/projects/deck/comments", comment],
    ["PATCH", "/projects/deck/comments/c1", { body: "Edited by B" }],
    ["DELETE", "/projects/deck/comments/c1"],
    ["GET", "/projects/deck/share-link"],
    ["PUT", "/projects/deck/share-link", share],
    ["PATCH", "/projects/deck/share-link", { cursor: 99, lastSyncedAt: NOW }],
    ["PATCH", "/projects/deck/share-link/settings", { reviewWindow: "none" }],
    ["DELETE", "/projects/deck/share-link"],
    ["GET", "/projects/deck/blobs/page:page-1"],
    ["DELETE", "/projects/deck/blobs/page:page-1"],
    [
      "POST",
      "/blobs/token",
      {
        type: "blob.generate-client-token",
        payload: { pathname: "x", clientPayload: JSON.stringify(upload), multipart: false },
      },
    ],
    ["POST", "/blobs/commit", { projectId: "deck", key: "page:page-1" }],
  ];
}

describe("workspace isolation", () => {
  it("answers 404 to every route B aims at A's workspace id", async () => {
    const before = await aData();
    for (const [method, route, body] of attempts()) {
      const response = await call(method, `/api/w/${a.workspaceId}${route}`, {
        cookie: b.cookie,
        body,
      });
      expect([method, route, response.status]).toEqual([method, route, 404]);
    }
    expect(await aData()).toEqual(before);
  });

  it.each([
    ["inline files", null],
    ["Vercel Blob", anyFileStore],
  ] as const)(
    "answers 404 to every route B aims at A's ids under its own workspace (%s)",
    async (_name, driver) => {
      holder.driver = driver;
      const before = await aData();
      const tries: Array<[string, string, unknown?]> = [
        ...attempts(),
        ["PUT", "/projects/deck/blobs/page:page-1", PNG],
      ];
      for (const [method, route, body] of tries) {
        const headers = body instanceof Uint8Array ? { "content-type": "image/png" } : undefined;
        const response = await call(method, `/api/w/${b.workspaceId}${route}`, {
          cookie: b.cookie,
          body,
          headers,
        });
        // Uploads the store doesn't take are refused before anything is looked up: inline
        // ones with Vercel Blob, client-upload tokens and commits without it.
        const wrongDriver = driver
          ? method === "PUT" && route.includes("/blobs/")
          : route.startsWith("/blobs/");
        const expected = wrongDriver ? 409 : 404;
        expect([method, route, response.status]).toEqual([method, route, expected]);
      }
      expect(await aData()).toEqual(before);
    },
  );

  it("never lists A's things in B's reads, and never stores B's files under A's paths", async () => {
    const as = (route: string) =>
      call("GET", `/api/w/${b.workspaceId}${route}`, { cookie: b.cookie });
    const wire = JSON.stringify(
      await Promise.all(
        ["/snapshot", "/folders", "/projects", "/projects?trash=1"].map(
          async (route): Promise<unknown> => (await as(route)).json(),
        ),
      ),
    );
    for (const secret of ["deck", "web", "a-only", "A's comment", a.workspaceId, share.shareId]) {
      expect(wire).not.toContain(secret);
    }
    await addFolder(db, b.workspaceId, "own");
    await call("POST", `/api/w/${b.workspaceId}/projects`, {
      cookie: b.cookie,
      body: URL_PROJECT("b-web", "own"),
    });
    await call("PUT", `/api/w/${b.workspaceId}/projects/b-web/blobs/crop:c1`, {
      cookie: b.cookie,
      body: PNG,
      headers: { "content-type": "image/png" },
    });
    const { rows } = await db.query<{ workspace_id: string; key: string }>(
      "SELECT workspace_id, key FROM workspace_blobs WHERE workspace_id = $1",
      [b.workspaceId],
    );
    expect(rows).toEqual([
      { workspace_id: b.workspaceId, key: blobPath(b.workspaceId, "b-web", "crop:c1") },
    ]);
  });

  it("refuses (409, saying nothing more) an import of a project id A has, and writes nothing", async () => {
    const before = await aData();
    const response = await call("POST", `/api/w/${b.workspaceId}/import`, {
      cookie: b.cookie,
      body: {
        folders: [{ id: "f1", name: "F", createdAt: NOW, parentId: null }],
        projects: [{ ...URL_PROJECT("deck"), createdAt: NOW, updatedAt: NOW }],
        snapshots: [],
        comments: [],
      },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "exists" });
    expect(await aData()).toEqual(before);
  });
});
