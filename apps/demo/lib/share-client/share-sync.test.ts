import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { JPEG, PNG } from "@/test/share-fixture";
import { connectedWorkspace } from "@/test/workspace-client";
import type { Database } from "../db/database";
import { SHARE_LIMITS } from "../share/limits";
import type { ShareState } from "../share/types";
import type { Project, ProjectShare } from "../store/types";
import { listComments } from "../workspace/comments";
import { createProject } from "../workspace/projects";

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

const SITE = "https://acme.example/";
const STATE: ShareState = {
  // As the owner's browser pushes project p1 (see `SITE_PROJECT`).
  project: { name: "Acme", source: { kind: "url", url: SITE }, createdAt: 0 },
  snapshots: Array.from({ length: 5 }, (_, index) => ({
    id: `s${index}`,
    width: 1280,
    height: 3000,
    createdAt: index,
    sourceUrl: SITE,
  })),
  comments: [],
};

/** An 8 MB JPEG: five of them fill a share's 40 MB. */
function fullSizeSnapshot(): Blob {
  const bytes = new Uint8Array(SHARE_LIMITS.blobBytes.snapshot);
  bytes.set(JPEG);
  return new Blob([bytes]);
}

function commentForm(id: string, withCrop: boolean, extra: { pageId?: string } = {}): FormData {
  const form = new FormData();
  const crop = withCrop ? { crop: { rect: { x: 0, y: 0, width: 10, height: 10 } } } : {};
  form.set(
    "comment",
    JSON.stringify({ id, x: 5, y: 5, body: "From the client", author: "Cleo", ...crop, ...extra }),
  );
  if (withCrop) form.set("crop", new Blob([PNG], { type: "image/png" }), "crop.png");
  return form;
}

let failCrops = false;
/** Every request sent, with its method, path and body size. */
const sent: Array<{ method: string; path: string; bytes: Promise<number> }> = [];

/** The share's own requests of `method` (not the workspace's), with their body sizes. */
const shareRequests = (method: string) =>
  Promise.all(
    sent
      .filter((request) => request.method === method && request.path.startsWith("/api/shares/"))
      .map(async (request) => ({ ...request, bytes: await request.bytes })),
  );

beforeEach(() => {
  failCrops = false;
  sent.length = 0;
  (globalThis as { squintShares?: unknown }).squintShares = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Records every request, and fails client crops while `failCrops` is set. */
function intercept(request: Request): Promise<Response> | null {
  const { pathname } = new URL(request.url);
  const bytes = request
    .clone()
    .arrayBuffer()
    .then((body) => body.byteLength);
  sent.push({ method: request.method, path: pathname, bytes });
  const crop = request.method === "GET" && pathname.includes("/blobs/crop");
  return failCrops && crop && pathname.startsWith("/api/shares/")
    ? Promise.resolve(new Response(null, { status: 503 }))
    : null;
}

/**
 * The owner's workspace with `project` in folder f1, signed in, its store
 * connected; then a share of it, made and attached as the Share button does.
 */
async function sharedWorkspace(project: Project, state: ShareState) {
  const workspace = await connectedWorkspace(holder, {
    setUp: async (db, workspaceId) => {
      const { id, name, source, createdAt } = project;
      const created = await createProject(
        db,
        workspaceId,
        { id, folderId: "f1", name, source, createdAt },
        1,
      );
      if (!created.ok) throw new Error(created.reason);
    },
    intercept: () => intercept,
  });
  const { ownerApi } = await import("./api");
  const created = await ownerApi.create(state);
  if (!created.ok) throw new Error(`create failed: ${created.error}`);
  const { shareId, token, ownerKey } = created.value;
  const share: ProjectShare = { id: shareId, token, ownerKey, createdAt: 0, cursor: 0 };
  const attached = await workspace.actions.shareProject(project.id, share);
  if (!attached.ok) throw new Error(attached.error);
  const sync = await import("./owner-sync");
  return { ...workspace, ownerApi, share, created: created.value, sync };
}

const SITE_PROJECT: Project = {
  id: "p1",
  folderId: "f1",
  name: "Acme",
  source: { kind: "url", url: SITE },
  createdAt: 0,
  updatedAt: 0,
};

describe("Qanto's scenario: a full share and a client crop", () => {
  it("refuses the crop for real, lets later comments through, and the owner's pull never stalls", async () => {
    const { share, ownerApi, sync, data, db, owner, store } = await sharedWorkspace(
      SITE_PROJECT,
      STATE,
    );
    for (const snapshot of STATE.snapshots) {
      expect((await ownerApi.upload(share, `snapshot:${snapshot.id}`, fullSizeSnapshot())).ok).toBe(
        true,
      );
    }

    // The share is at 40 MB: a comment with a crop is refused, and a retry gets the same answer.
    const { clientApi } = await import("./api");
    const client = clientApi(share.token);
    for (const attempt of [1, 2]) {
      const refused = await client.addComment(commentForm("k-crop", true));
      expect({ attempt, refused }).toMatchObject({
        attempt,
        refused: { ok: false, status: 413, error: "share-full" },
      });
    }
    // Nothing was half-saved: a later comment (no crop) goes through.
    expect((await client.addComment(commentForm("k-plain", false))).ok).toBe(true);

    // A row whose crop can never be read (as older builds could leave behind).
    const { shareServices } = await import("../share/server");
    const services = await shareServices();
    await services.store.insertComment(
      share.id,
      {
        id: "k-orphan",
        x: 1,
        y: 1,
        body: "Orphan",
        author: "Cleo",
        status: "active",
        createdAt: 9,
        updatedAt: 9,
        crop: { rect: { x: 0, y: 0, width: 5, height: 5 } },
      },
      "client",
    );

    // A temporary failure on the crop holds the cursor (and says so); the rest merges.
    failCrops = true;
    await sync.pullNow("p1");
    expect(data().comments.map((c) => c.id)).toEqual(["k-plain"]);
    expect(data().projects[0]?.share?.cursor).toBe(0);
    expect(sync.syncStatus("p1").pullHeld).toBe(true);

    // The image is gone for good (404): the comment merges without it and the cursor moves on.
    failCrops = false;
    await sync.pullNow("p1");
    const merged = data().comments;
    expect(merged.map((c) => c.id).sort()).toEqual(["k-orphan", "k-plain"]);
    expect(merged.find((c) => c.id === "k-orphan")).not.toHaveProperty("crop");
    expect(data().projects[0]?.share?.cursor).toBeGreaterThan(0);
    expect(sync.syncStatus("p1").pullHeld).toBe(false);

    // Saved to the workspace, so any of its browsers sees them.
    await store.whenSaved();
    const saved = await listComments(db, owner.workspaceId, "p1");
    expect(saved.map((c) => c.id).sort()).toEqual(["k-orphan", "k-plain"]);
    // Saved as guests' comments: without an author account.
    const { rows } = await db.query("SELECT 1 FROM comments WHERE author_user_id IS NOT NULL");
    expect(rows).toEqual([]);
  }, 60_000);
});

describe("Qanto's scenario: many long client comments", () => {
  it("never makes the owner's push outgrow a request: unchanged items aren't resent", async () => {
    const { share, sync, data, actions } = await sharedWorkspace(SITE_PROJECT, {
      ...STATE,
      snapshots: [],
    });
    const { clientApi } = await import("./api");
    const client = clientApi(share.token);
    for (let index = 0; index < 220; index += 1) {
      const form = new FormData();
      form.set(
        "comment",
        JSON.stringify({
          id: `long-${index}`,
          x: 1,
          y: 1,
          body: "x".repeat(SHARE_LIMITS.body),
          author: "Cleo",
        }),
      );
      expect((await client.addComment(form)).ok).toBe(true);
    }

    await sync.pullNow("p1");
    expect(data().comments).toHaveLength(220);

    sent.length = 0;
    await sync.pushNow("p1");
    expect(sync.syncStatus("p1").phase).toBe("idle");
    // Nothing changed on the owner's side: the manifest only, no changes sent.
    expect(await shareRequests("PATCH")).toEqual([]);

    // Resolving one sends just that one, well under the 1 MB body limit.
    actions.setCommentStatus("long-7", "resolved");
    sent.length = 0;
    await sync.pushNow("p1");
    const patches = await shareRequests("PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0]?.bytes).toBeLessThan(SHARE_LIMITS.body + 2_000);
    const sizes = await Promise.all(sent.map((request) => request.bytes));
    expect(Math.max(...sizes)).toBeLessThanOrEqual(SHARE_LIMITS.jsonBytes);
    const { shareServices } = await import("../share/server");
    const rows = await (await shareServices()).store.comments(share.id);
    expect(rows.find((row) => row.item.id === "long-7")?.item.status).toBe("resolved");
  }, 120_000);
});

describe("sharing a page project", () => {
  it("uploads each page from the workspace, and a client's page comment comes back on it", async () => {
    const project: Project = {
      id: "p1",
      folderId: "f1",
      name: "Mockups",
      source: {
        kind: "pages",
        origin: "image",
        // Page 1 was migrated from version 2 and still uses its old key.
        pages: [
          { id: "page-1", blobKey: "image:p1", name: "home.png" },
          { id: "pg2", blobKey: "page:pg2", name: "about.png", width: 800, height: 600 },
        ],
        fileName: "home.png",
      },
      createdAt: 0,
      updatedAt: 0,
    };
    const { toShareState } = await import("./share-state");
    const { share, created, sync, data, store } = await sharedWorkspace(project, {
      ...toShareState(project, [], []),
      comments: [],
    });
    expect(created.missingBlobs).toEqual(["page:page-1", "page:pg2"]);
    const { storeWorkspaceBlob } = await import("../workspace-client/blob-upload");
    await storeWorkspaceBlob("p1", "image:p1", new Blob([PNG], { type: "image/png" }));
    await storeWorkspaceBlob("p1", "page:pg2", new Blob([JPEG], { type: "image/jpeg" }));

    await sync.pushNow("p1");
    expect(sync.syncStatus("p1").phase).toBe("idle");
    const { clientApi } = await import("./api");
    const client = clientApi(share.token);
    const page1 = await fetch(client.blobUrl("page:page-1"));
    expect(page1.headers.get("content-type")).toBe("image/png");
    const page2 = await fetch(client.blobUrl("page:pg2"));
    expect(page2.headers.get("content-type")).toBe("image/jpeg");

    const onPage = (id: string, pageId: string) => commentForm(id, true, { pageId });
    expect(await client.addComment(onPage("k-gone", "nope"))).toMatchObject({
      ok: false,
      status: 422,
      error: "unknown-page",
    });
    expect((await client.addComment(onPage("k-page", "pg2"))).ok).toBe(true);

    await sync.pullNow("p1");
    const pulled = data().comments;
    expect(pulled.map(({ id, pageId }) => [id, pageId])).toEqual([["k-page", "pg2"]]);
    expect(pulled[0]?.crop?.blobKey).toBe("crop:k-page");
    await store.whenSaved();
    expect(await store.workspaceBlobs()?.get("crop:k-page")).not.toBeNull();

    // Replacing page 2's picture in place sends it again, under its next revision.
    const { replaceWithImage } = await import("../store/actions");
    const blob = new Blob([PNG], { type: "image/png" });
    const image = { blob, fileName: "about-v2.png", width: 800, height: 600 };
    expect(
      (await replaceWithImage("p1", image, { referenceUrl: undefined, pageId: "pg2" })).ok,
    ).toBe(true);
    await sync.pushNow("p1");
    expect(sync.syncStatus("p1").phase).toBe("idle");
    const replaced = await fetch(client.blobUrl("page:pg2:1"));
    expect(replaced.headers.get("content-type")).toBe("image/png");
    expect((await fetch(client.blobUrl("page:pg2"))).status).toBe(404);
    const view = await client.view();
    expect(view.ok && view.value.project.source).toMatchObject({
      pages: [{ id: "page-1" }, { id: "pg2", name: "about-v2.png", rev: 1 }],
    });
  }, 60_000);
});
