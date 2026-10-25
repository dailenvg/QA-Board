import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JPEG, PNG } from "@/test/share-fixture";
import { routeFetch } from "@/test/route-fetch";
import { SHARE_LIMITS } from "../share/limits";
import type { ShareState } from "../share/types";
import type { ProjectShare, SquintData } from "../store/types";

/** A Storage stand-in for the owner's browser. */
function fakeStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

const SITE = "https://acme.example/";
const STATE: ShareState = {
  project: { name: "Acme", source: { kind: "url", url: SITE } },
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
/** Every request body sent, with its method and path. */
const sent: Array<{ method: string; path: string; bytes: number }> = [];

beforeEach(() => {
  failCrops = false;
  sent.length = 0;
  vi.resetModules();
  vi.stubGlobal("localStorage", fakeStorage());
  vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
  const fetch = routeFetch((request) =>
    failCrops && request.method === "GET" && request.url.includes("/blobs/crop")
      ? new Response(null, { status: 503 })
      : null,
  );
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? init.body.length : 0;
    sent.push({
      method: init?.method ?? "GET",
      path: new URL(input instanceof Request ? input.url : input.toString(), "http://x").pathname,
      bytes: body,
    });
    return fetch(input, init);
  });
});

/** The owner's browser, with project p1 shared as `share`. */
function ownerData(share: ProjectShare): SquintData {
  return {
    version: 3,
    folders: [{ id: "default", name: "My projects", createdAt: 0, parentId: null }],
    projects: [
      {
        id: "p1",
        folderId: "default",
        name: "Acme",
        source: { kind: "url", url: SITE },
        createdAt: 0,
        updatedAt: 0,
        share,
      },
    ],
    comments: [],
    snapshots: [],
    revocations: [],
    authorName: null,
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("Qanto's scenario: a full share and a client crop", () => {
  it("refuses the crop for real, lets later comments through, and the owner's pull never stalls", async () => {
    const { ownerApi, clientApi } = await import("./api");
    const created = await ownerApi.create(STATE);
    if (!created.ok) throw new Error("create failed");
    const { shareId, token, ownerKey } = created.value;
    const share: ProjectShare = { id: shareId, token, ownerKey, createdAt: 0, cursor: 0 };
    for (const snapshot of STATE.snapshots) {
      expect((await ownerApi.upload(share, `snapshot:${snapshot.id}`, fullSizeSnapshot())).ok).toBe(
        true,
      );
    }

    // The share is at 40 MB: a comment with a crop is refused, and a retry gets the same answer.
    const client = clientApi(token);
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
    const { store } = await shareServices();
    await store.insertComment(
      shareId,
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

    // The owner's browser, with the project shared.
    const data: SquintData = {
      version: 3,
      folders: [{ id: "default", name: "My projects", createdAt: 0, parentId: null }],
      projects: [
        {
          id: "p1",
          folderId: "default",
          name: "Acme",
          source: { kind: "url", url: SITE },
          createdAt: 0,
          updatedAt: 0,
          share,
        },
      ],
      comments: [],
      snapshots: [],
      revocations: [],
      authorName: null,
    };
    localStorage.setItem("squint:v3", JSON.stringify(data));
    const sync = await import("./owner-sync");
    const { getSnapshot } = await import("../store/store");
    const local = () => {
      const state = getSnapshot();
      if (state.status !== "ready") throw new Error("store not ready");
      return state.data;
    };

    // A temporary failure on the crop holds the cursor (and says so); the rest merges.
    failCrops = true;
    await sync.pullNow("p1");
    expect(local().comments.map((c) => c.id)).toEqual(["k-plain"]);
    expect(local().projects[0]?.share?.cursor).toBe(0);
    expect(sync.syncStatus("p1").pullHeld).toBe(true);

    // The image is gone for good (404): the comment merges without it and the cursor moves on.
    failCrops = false;
    await sync.pullNow("p1");
    const merged = local().comments;
    expect(merged.map((c) => c.id).sort()).toEqual(["k-orphan", "k-plain"]);
    expect(merged.find((c) => c.id === "k-orphan")).not.toHaveProperty("crop");
    expect(local().projects[0]?.share?.cursor).toBeGreaterThan(0);
    expect(sync.syncStatus("p1").pullHeld).toBe(false);
  }, 30_000);
});

describe("Qanto's scenario: many long client comments", () => {
  it("never makes the owner's push outgrow a request: unchanged items aren't resent", async () => {
    const { ownerApi, clientApi } = await import("./api");
    const created = await ownerApi.create({ ...STATE, snapshots: [] });
    if (!created.ok) throw new Error("create failed");
    const { shareId, token, ownerKey } = created.value;
    const share: ProjectShare = { id: shareId, token, ownerKey, createdAt: 0, cursor: 0 };
    const client = clientApi(token);
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

    localStorage.setItem("squint:v3", JSON.stringify(ownerData(share)));
    const sync = await import("./owner-sync");
    const { dispatch, getSnapshot } = await import("../store/store");
    await sync.pullNow("p1");
    const state = getSnapshot();
    expect(state.status === "ready" && state.data.comments).toHaveLength(220);

    sent.length = 0;
    await sync.pushNow("p1");
    expect(sync.syncStatus("p1").phase).toBe("idle");
    // Nothing changed on the owner's side: the manifest only, no changes sent.
    expect(sent.filter((request) => request.method === "PATCH")).toEqual([]);

    // Resolving one sends just that one, well under the 1 MB body limit.
    dispatch({ type: "comment/set-status", id: "long-7", status: "resolved", at: 99 });
    sent.length = 0;
    await sync.pushNow("p1");
    const patches = sent.filter((request) => request.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0]?.bytes).toBeLessThan(SHARE_LIMITS.body + 2_000);
    expect(Math.max(...sent.map((request) => request.bytes))).toBeLessThanOrEqual(
      SHARE_LIMITS.jsonBytes,
    );
    const { shareServices } = await import("../share/server");
    const rows = await (await shareServices()).store.comments(shareId);
    expect(rows.find((row) => row.item.id === "long-7")?.item.status).toBe("resolved");
  }, 30_000);
});

describe("sharing a page project", () => {
  it("uploads each page from wherever it's kept, and a client's page comment comes back on it", async () => {
    const { ownerApi, clientApi } = await import("./api");
    const { putBlob } = await import("../blob-store/blob-store");
    const { toShareState } = await import("./share-state");
    const project: SquintData["projects"][number] = {
      id: "p1",
      folderId: "default",
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
    const created = await ownerApi.create({ ...toShareState(project, [], []), comments: [] });
    if (!created.ok) throw new Error("create failed");
    const { shareId, token, ownerKey } = created.value;
    const share: ProjectShare = { id: shareId, token, ownerKey, createdAt: 0, cursor: 0 };
    expect(created.value.missingBlobs).toEqual(["page:page-1", "page:pg2"]);
    await putBlob("image:p1", new Blob([PNG], { type: "image/png" }));
    await putBlob("page:pg2", new Blob([JPEG], { type: "image/jpeg" }));
    localStorage.setItem(
      "squint:v3",
      JSON.stringify({ ...ownerData(share), projects: [{ ...project, share }] }),
    );

    const sync = await import("./owner-sync");
    await sync.pushNow("p1");
    expect(sync.syncStatus("p1").phase).toBe("idle");
    const client = clientApi(token);
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
    const { getSnapshot } = await import("../store/store");
    const state = getSnapshot();
    const pulled = state.status === "ready" ? state.data.comments : [];
    expect(pulled.map(({ id, pageId }) => [id, pageId])).toEqual([["k-page", "pg2"]]);
    expect(pulled[0]?.crop?.blobKey).toBe("crop:k-page");
  }, 30_000);
});
