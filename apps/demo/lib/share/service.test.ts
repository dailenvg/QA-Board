import { describe, expect, it } from "vitest";
import { COMMENT, JPEG, PNG, SNAPSHOT, STATE } from "@/test/share-fixture";
import { inlineBackend } from "./blob-backend";
import { createMemoryStore } from "./memory-store";
import { SHARE_LIMITS } from "./schemas";
import type { ShareServices } from "./server";
import {
  addClientComment,
  captureForClient,
  clientShare,
  clientView,
  createShare,
  ownerShare,
  pullChanges,
  pushState,
  putOwnerBlob,
  readBlob,
  revokeShare,
} from "./service";

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
    const results = [];
    for (const item of many)
      results.push((await putOwnerBlob(services, share, `snapshot:${item.id}`, snapshot)).ok);
    // Five 8 MB snapshots fill the 40 MB share exactly; the sixth is refused.
    expect(results).toEqual([true, true, true, true, true, false]);
  });
});

describe("client writes", () => {
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
});
