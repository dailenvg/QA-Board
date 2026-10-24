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

function commentForm(id: string, withCrop: boolean): FormData {
  const form = new FormData();
  const crop = withCrop ? { crop: { rect: { x: 0, y: 0, width: 10, height: 10 } } } : {};
  form.set(
    "comment",
    JSON.stringify({ id, x: 5, y: 5, body: "From the client", author: "Cleo", ...crop }),
  );
  if (withCrop) form.set("crop", new Blob([PNG], { type: "image/png" }), "crop.png");
  return form;
}

let failCrops = false;

beforeEach(() => {
  failCrops = false;
  vi.resetModules();
  vi.stubGlobal("localStorage", fakeStorage());
  vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal(
    "fetch",
    routeFetch((request) =>
      failCrops && request.method === "GET" && request.url.includes("/blobs/crop")
        ? new Response(null, { status: 503 })
        : null,
    ),
  );
});
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
      version: 2,
      folders: [{ id: "default", name: "My projects", createdAt: 0 }],
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
    localStorage.setItem("squint:v2", JSON.stringify(data));
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
