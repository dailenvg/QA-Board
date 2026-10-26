import { describe, expect, it } from "vitest";
import { COMMENT, JPEG, PNG, SNAPSHOT, STATE } from "@/test/share-fixture";
import { inlineBackend } from "./blob-backend";
import { createMemoryStore } from "./memory-store";
import { REVIEW_WINDOW_MS } from "./review-window";
import { SHARE_LIMITS } from "./schemas";
import { batchChange, diffState } from "../share-client/diff";
import type { ShareServices } from "./server";
import type { ShareRecord, ShareState } from "./types";
import {
  addClientComment,
  captureForClient,
  clientShare,
  clientView,
  createShare,
  ownerShare,
  pullChanges,
  applyChanges,
  shareManifest,
  putOwnerBlob,
  readBlob,
  revokeShare,
} from "./service";

/** The owner's whole state, sent the way the browser does: diffed and batched. */
async function pushState(
  services: ShareServices,
  share: ShareRecord,
  state: ShareState,
  cursor: number,
  now: number,
) {
  const manifest = await shareManifest(services.store, share);
  for (const batch of batchChange(diffState(state, manifest), cursor)) {
    const applied = await applyChanges(services, share, batch, now);
    if (!applied.ok) return applied;
  }
  return { ok: true as const };
}

async function shared() {
  const services: ShareServices = { store: createMemoryStore(), blobs: inlineBackend };
  const created = await createShare(services, STATE, 100);
  const share = await ownerShare(services.store, created.shareId, created.ownerKey);
  if (!share) throw new Error("no share");
  return { services, created, share };
}

const clientComment = (id: string) => ({ id, x: 5, y: 5, body: "From the client", author: "Cleo" });

describe("access", () => {
  it("opens a share by owner key or by token, never the other way round", async () => {
    const { services, created } = await shared();
    const { store } = services;
    expect(await ownerShare(store, created.shareId, created.ownerKey)).not.toBeNull();
    expect(await clientShare(store, created.token)).not.toBeNull();
    expect(await ownerShare(store, created.shareId, created.token)).toBeNull();
    expect(await ownerShare(store, created.shareId, null)).toBeNull();
    expect(await ownerShare(store, "other", created.ownerKey)).toBeNull();
    expect(await clientShare(store, created.ownerKey)).toBeNull();
    expect(await clientShare(store, "short")).toBeNull();
  });

  it("forgets a revoked share entirely", async () => {
    const { services, created, share } = await shared();
    await putOwnerBlob(services, share, "crop:c-1", PNG);
    await revokeShare(services, share);
    expect(await clientShare(services.store, created.token)).toBeNull();
    expect(await ownerShare(services.store, created.shareId, created.ownerKey)).toBeNull();
  });
});

describe("owner push and pull", () => {
  it("asks for the blobs its data points at", async () => {
    const { created } = await shared();
    expect(created.missingBlobs).toEqual(["crop:c-1", "snapshot:snap-1"]);
  });

  it("keeps client comments the owner hasn't pulled, and deletes pulled ones it left out", async () => {
    const { services, share } = await shared();
    await addClientComment(services, share, clientComment("k-1"), null, 200);
    const unseen = await pullChanges(services.store, share, 0);
    expect(unseen.comments.map((comment) => comment.id)).toEqual(["k-1"]);

    // Pushed before pulling: the client comment survives.
    await pushState(services, share, STATE, 0, 300);
    expect((await clientView(services.store, share)).comments.map((c) => c.id)).toEqual([
      "c-1",
      "k-1",
    ]);

    // Pushed after pulling, without it: the owner deleted it.
    await pushState(services, share, STATE, unseen.cursor, 400);
    expect((await clientView(services.store, share)).comments.map((c) => c.id)).toEqual(["c-1"]);
  });

  it("lets the owner win on status, and only reports client additions after the cursor", async () => {
    const { services, share } = await shared();
    await addClientComment(services, share, clientComment("k-1"), null, 200);
    const first = await pullChanges(services.store, share, 0);
    const resolved = {
      ...clientComment("k-1"),
      status: "resolved" as const,
      createdAt: 200,
      updatedAt: 200,
      resolvedAt: 500,
    };
    await pushState(
      services,
      share,
      { ...STATE, comments: [COMMENT, resolved] },
      first.cursor,
      500,
    );
    const view = await clientView(services.store, share);
    expect(view.comments.find((c) => c.id === "k-1")?.status).toBe("resolved");
    expect(await pullChanges(services.store, share, first.cursor)).toEqual({
      snapshots: [],
      comments: [],
      cursor: first.cursor,
    });
  });

  it("drops blobs nothing points at any more", async () => {
    const { services, share } = await shared();
    await putOwnerBlob(services, share, "crop:c-1", PNG);
    await pushState(services, share, { ...STATE, comments: [] }, 0, 200);
    expect(await readBlob(services, share, "crop:c-1")).toBeNull();
  });
});

describe("blob rules", () => {
  it("accepts referenced images only, by their real type", async () => {
    const { services, share } = await shared();
    expect(await putOwnerBlob(services, share, "crop:nope", PNG)).toMatchObject({
      ok: false,
      status: 422,
    });
    expect(
      await putOwnerBlob(services, share, "crop:c-1", new TextEncoder().encode("<svg/>")),
    ).toMatchObject({ ok: false, status: 415 });
    expect(await putOwnerBlob(services, share, "snapshot:snap-1", JPEG)).toMatchObject({
      ok: true,
    });
    expect(await readBlob(services, share, "snapshot:snap-1")).toMatchObject({
      contentType: "image/jpeg",
    });
  });

  it("enforces per-kind and per-share size limits", async () => {
    const { services, share } = await shared();
    const big = new Uint8Array(SHARE_LIMITS.blobBytes.crop + 1);
    big.set(PNG);
    expect(await putOwnerBlob(services, share, "crop:c-1", big)).toMatchObject({
      ok: false,
      status: 413,
    });
    const snapshot = new Uint8Array(SHARE_LIMITS.blobBytes.snapshot);
    snapshot.set(JPEG);
    const many = Array.from({ length: 6 }, (_, index) => ({ ...SNAPSHOT, id: `s${index}` }));
    await pushState(services, share, { ...STATE, snapshots: many }, 0, 200);
    const half = SHARE_LIMITS.blobBytes.snapshot / 2;
    const results = [];
    for (const item of many) {
      const key = `snapshot:${item.id}`;
      await putOwnerBlob(services, share, key, snapshot.slice(0, half), { part: 0, parts: 2 });
      results.push(
        (await putOwnerBlob(services, share, key, snapshot.slice(half), { part: 1, parts: 2 })).ok,
      );
    }
    // Five 8 MB snapshots fill the 40 MB share exactly; the sixth is refused.
    expect(results).toEqual([true, true, true, true, true, false]);
  });
});

describe("uploads in parts", () => {
  it("joins parts in order once the last one arrives", async () => {
    const { services, share } = await shared();
    const first = new Uint8Array([...JPEG, 1, 2, 3]);
    const second = new Uint8Array([4, 5, 6]);
    expect(
      await putOwnerBlob(services, share, "snapshot:snap-1", first, { part: 0, parts: 2 }),
    ).toMatchObject({
      ok: true,
      value: { complete: false, size: first.length },
    });
    expect(await readBlob(services, share, "snapshot:snap-1")).toBeNull();
    expect(
      await putOwnerBlob(services, share, "snapshot:snap-1", second, { part: 1, parts: 2 }),
    ).toMatchObject({
      ok: true,
      value: { complete: true, size: first.length + second.length },
    });
    const stored = await readBlob(services, share, "snapshot:snap-1");
    expect([...(stored?.bytes ?? [])]).toEqual([...first, ...second]);
  });

  it("refuses impossible part numbers and oversized totals", async () => {
    const { services, share } = await shared();
    expect(
      await putOwnerBlob(services, share, "crop:c-1", PNG, { part: 2, parts: 2 }),
    ).toMatchObject({ status: 400 });
    // A crop is at most 2 MB, so it never needs more than one 4 MB part.
    expect(
      await putOwnerBlob(services, share, "crop:c-1", PNG, { part: 0, parts: 2 }),
    ).toMatchObject({ status: 400 });
    const big = new Uint8Array(SHARE_LIMITS.transferBytes);
    big.set(JPEG);
    await putOwnerBlob(services, share, "snapshot:snap-1", big, { part: 0, parts: 2 });
    expect(
      await putOwnerBlob(services, share, "snapshot:snap-1", big, { part: 1, parts: 2 }),
    ).toMatchObject({ ok: true });
    const tooBig = await putOwnerBlob(services, share, "snapshot:snap-1", big, {
      part: 2,
      parts: 3,
    });
    expect(tooBig).toMatchObject({ status: 400 });
  });
});

describe("client writes", () => {
  it("stores the crop before the row: a full share refuses it for real, every time", async () => {
    const { services, share } = await shared();
    const many = Array.from({ length: 5 }, (_, index) => ({ ...SNAPSHOT, id: `f${index}` }));
    await pushState(services, share, { ...STATE, snapshots: many }, 0, 200);
    const half = SHARE_LIMITS.blobBytes.snapshot / 2;
    const full = new Uint8Array(SHARE_LIMITS.blobBytes.snapshot);
    full.set(JPEG);
    for (const item of many) {
      const key = `snapshot:${item.id}`;
      await putOwnerBlob(services, share, key, full.slice(0, half), { part: 0, parts: 2 });
      await putOwnerBlob(services, share, key, full.slice(half), { part: 1, parts: 2 });
    }
    const input = {
      ...clientComment("k-1"),
      crop: { rect: { x: 0, y: 0, width: 10, height: 10 } },
    };
    for (const _attempt of [1, 2]) {
      expect(await addClientComment(services, share, input, PNG, 300)).toMatchObject({
        ok: false,
        status: 413,
        error: "share-full",
      });
    }
    expect((await clientView(services.store, share)).comments.map((c) => c.id)).toEqual(["c-1"]);
  });

  it("adds an active comment once, with its crop", async () => {
    const { services, share } = await shared();
    const input = {
      ...clientComment("k-1"),
      crop: { rect: { x: 0, y: 0, width: 10, height: 10 } },
    };
    const added = await addClientComment(services, share, input, PNG, 200);
    expect(added).toMatchObject({ ok: true, value: { status: "active", createdAt: 200 } });
    expect(await readBlob(services, share, "crop:k-1")).not.toBeNull();
    expect(await addClientComment(services, share, input, PNG, 300)).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(await addClientComment(services, share, clientComment("k-2"), PNG, 300)).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      await addClientComment(
        services,
        share,
        { ...clientComment("k-3"), snapshotId: "nope" },
        null,
        300,
      ),
    ).toMatchObject({ ok: false, status: 422 });
  });

  it("captures only the shared project's own address", async () => {
    const { services, share } = await shared();
    const asked: string[] = [];
    const capture = (url: URL, width: number) => {
      asked.push(`${url.href}@${width}`);
      return Promise.resolve({
        body: new Uint8Array(JPEG),
        contentType: "image/jpeg",
        width,
        height: 900,
        scale: 1,
      });
    };
    const added = await captureForClient(services, share, 1024, capture, 200);
    expect(asked).toEqual(["https://acme.example/@1024"]);
    expect(added).toMatchObject({
      ok: true,
      value: { width: 1024, height: 900, sourceUrl: "https://acme.example/" },
    });
    const changes = await pullChanges(services.store, share, 0);
    expect(changes.snapshots).toHaveLength(1);
  });

  it("leaves no snapshot without an image when storing the image throws", async () => {
    const { services, share } = await shared();
    const before = await services.store.snapshots(share.id);
    const broken: ShareServices = {
      ...services,
      blobs: { ...inlineBackend, save: () => Promise.reject(new Error("blob store down")) },
    };
    const capture = (_url: URL, width: number) =>
      Promise.resolve({
        body: new Uint8Array(JPEG),
        contentType: "image/jpeg",
        width,
        height: 900,
        scale: 1,
      });
    await expect(captureForClient(broken, share, 1024, capture, 200)).rejects.toThrow(
      "blob store down",
    );
    expect(await services.store.snapshots(share.id)).toEqual(before);
    expect((await pullChanges(services.store, share, 0)).snapshots).toEqual([]);
  });
});

describe("review window", () => {
  /** `shared()` creates the share at 100. */
  const deadline = 100 + REVIEW_WINDOW_MS;
  const capture = (_url: URL, width: number) =>
    Promise.resolve({
      body: new Uint8Array(JPEG),
      contentType: "image/jpeg",
      width,
      height: 900,
      scale: 1,
    });

  it("tells clients when it closes: 72 hours after the link was created", async () => {
    const { services, share } = await shared();
    expect((await clientView(services.store, share)).reviewEndsAt).toBe(deadline);
  });

  it("doesn't move when the owner pushes updates", async () => {
    const { services, share } = await shared();
    await pushState(services, share, { ...STATE, comments: [] }, 0, deadline - 1);
    expect((await clientView(services.store, share)).reviewEndsAt).toBe(deadline);
  });

  it("takes client comments and snapshots until the last moment before the deadline", async () => {
    const { services, share } = await shared();
    expect(
      await addClientComment(services, share, clientComment("k-1"), null, deadline - 1),
    ).toMatchObject({ ok: true });
    expect(await captureForClient(services, share, 1024, capture, deadline - 1)).toMatchObject({
      ok: true,
    });
  });

  it("refuses client comments and snapshots from the deadline on, leaving the share readable", async () => {
    const { services, share } = await shared();
    const closed = { ok: false, status: 403, error: "review-closed" };
    expect(
      await addClientComment(services, share, clientComment("k-1"), null, deadline),
    ).toMatchObject(closed);
    let captured = false;
    const watched = (url: URL, width: number) => {
      captured = true;
      return capture(url, width);
    };
    expect(await captureForClient(services, share, 1024, watched, deadline + 1)).toMatchObject(
      closed,
    );
    expect(captured).toBe(false);
    const view = await clientView(services.store, share);
    expect(view.comments.map((comment) => comment.id)).toEqual(["c-1"]);
    expect(view.snapshots.map((snapshot) => snapshot.id)).toEqual(["snap-1"]);
  });
});

describe("owner changes", () => {
  it("sends nothing when nothing changed, and only what changed otherwise", async () => {
    const { services, share } = await shared();
    const manifest = await shareManifest(services.store, share);
    expect(batchChange(diffState(STATE, manifest), 0)).toEqual([]);
    const edited = { ...STATE, comments: [{ ...COMMENT, body: "Edited" }] };
    const batches = batchChange(diffState(edited, manifest), 0);
    expect(batches).toHaveLength(1);
    expect(batches[0]?.comments.map((c) => c.body)).toEqual(["Edited"]);
    expect(batches[0]?.snapshots).toEqual([]);
  });

  it("keeps every batch small, however large the state", async () => {
    const { services, share } = await shared();
    const comments = Array.from({ length: 300 }, (_, index) => ({
      ...COMMENT,
      id: `big-${index}`,
      body: "x".repeat(SHARE_LIMITS.body),
    }));
    const manifest = await shareManifest(services.store, share);
    const batches = batchChange(diffState({ ...STATE, comments }, manifest), 0);
    expect(batches.length).toBeGreaterThan(2);
    for (const batch of batches) {
      expect(JSON.stringify(batch).length).toBeLessThanOrEqual(SHARE_LIMITS.changeBatchBytes);
    }
    expect((await pushState(services, share, { ...STATE, comments }, 0, 200)).ok).toBe(true);
    expect((await clientView(services.store, share)).comments).toHaveLength(300);
  });

  it("refuses changes that would take a share past 1000 comments", async () => {
    const { services, share } = await shared();
    const comments = Array.from({ length: SHARE_LIMITS.comments + 1 }, (_, index) => ({
      ...COMMENT,
      id: `n-${index}`,
    }));
    expect(await pushState(services, share, { ...STATE, comments }, 0, 200)).toMatchObject({
      ok: false,
      status: 413,
      error: "share-full",
    });
  });

  it("caps client additions too: a full share refuses comments and snapshots", async () => {
    const { services, share } = await shared();
    const comments = Array.from({ length: SHARE_LIMITS.comments }, (_, index) => ({
      ...COMMENT,
      id: `n-${index}`,
    }));
    await pushState(services, share, { ...STATE, comments }, 0, 200);
    expect(await addClientComment(services, share, clientComment("k-1"), null, 300)).toMatchObject({
      status: 413,
      error: "share-full",
    });
    const snapshots = Array.from({ length: SHARE_LIMITS.snapshots }, (_, index) => ({
      ...SNAPSHOT,
      id: `m-${index}`,
    }));
    await pushState(services, share, { ...STATE, snapshots, comments }, 0, 300);
    const capture = () => Promise.reject(new Error("must not capture"));
    expect(await captureForClient(services, share, 800, capture, 400)).toMatchObject({
      status: 413,
      error: "share-full",
    });
  });
});

describe("page projects", () => {
  const PAGES: ShareState = {
    project: {
      name: "Mockups",
      source: {
        kind: "pages",
        origin: "image",
        fileName: "home.png",
        pages: [
          { id: "p1", name: "home.png", width: 1200, height: 900 },
          { id: "p2", name: "about.png" },
        ],
      },
    },
    snapshots: [SNAPSHOT],
    comments: [{ ...COMMENT, id: "o-1", snapshotId: undefined, crop: undefined, pageId: "p2" }],
  };

  async function pagesShared() {
    const services: ShareServices = { store: createMemoryStore(), blobs: inlineBackend };
    const created = await createShare(services, PAGES, 100);
    const share = await ownerShare(services.store, created.shareId, created.ownerKey);
    if (!share) throw new Error("no share");
    return { services, created, share };
  }

  it("asks for every page's image, up to 15 MB each, and drops a removed page's", async () => {
    const { services, created, share } = await pagesShared();
    expect(created.missingBlobs).toEqual(["page:p1", "page:p2", "snapshot:snap-1"]);
    const tooBig = new Uint8Array(SHARE_LIMITS.blobBytes.page + 1);
    tooBig.set(PNG);
    const half = Math.ceil(tooBig.length / 4);
    let last = null;
    for (let part = 0; part < 4; part += 1) {
      last = await putOwnerBlob(
        services,
        share,
        "page:p1",
        tooBig.slice(part * half, (part + 1) * half),
        {
          part,
          parts: 4,
        },
      );
    }
    expect(last).toMatchObject({ ok: false, status: 413 });
    expect(await putOwnerBlob(services, share, "page:p2", PNG)).toMatchObject({ ok: true });
    expect(await readBlob(services, share, "page:p2")).toMatchObject({ contentType: "image/png" });

    const source = PAGES.project.source;
    if (source.kind !== "pages") throw new Error("not pages");
    const onePage = { ...source, pages: source.pages.slice(0, 1) };
    await pushState(
      services,
      share,
      { ...PAGES, project: { ...PAGES.project, source: onePage }, comments: [] },
      0,
      200,
    );
    const updated = await ownerShare(services.store, created.shareId, created.ownerKey);
    if (!updated) throw new Error("no share");
    expect(await readBlob(services, updated, "page:p2")).toBeNull();
  });

  it("accepts a client comment only on one of the project's pages", async () => {
    const { services, share } = await pagesShared();
    const rect = { rect: { x: 0, y: 0, width: 10, height: 10 } };
    const refused = [
      { ...clientComment("k-1") },
      { ...clientComment("k-2"), pageId: "nope" },
      { ...clientComment("k-3"), pageId: "p1", snapshotId: "snap-1" },
    ];
    for (const input of refused) {
      expect(await addClientComment(services, share, input, null, 200)).toMatchObject({
        ok: false,
        status: 422,
        error: "unknown-page",
      });
    }
    // Nothing of a refused comment stays: its id can still be posted on a real page.
    const fixed = { ...clientComment("k-2"), pageId: "p2", crop: rect };
    expect(await addClientComment(services, share, fixed, PNG, 300)).toMatchObject({
      ok: true,
      value: { id: "k-2", pageId: "p2", status: "active" },
    });
    expect(await readBlob(services, share, "crop:k-2")).not.toBeNull();
    const onSnapshot = { ...clientComment("k-4"), snapshotId: "snap-1" };
    expect(await addClientComment(services, share, onSnapshot, null, 300)).toMatchObject({
      ok: true,
    });
    const pulled = await pullChanges(services.store, share, 0);
    expect(pulled.comments.map((comment) => [comment.id, comment.pageId])).toEqual([
      ["k-2", "p2"],
      ["k-4", undefined],
    ]);
  });

  it("refuses a page on a website's comments", async () => {
    const { services, share } = await shared();
    expect(
      await addClientComment(services, share, { ...clientComment("k-1"), pageId: "p1" }, null, 200),
    ).toMatchObject({ ok: false, status: 422, error: "unknown-page" });
  });
});
