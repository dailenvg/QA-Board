import { describe, expect, it } from "vitest";
import { STATE } from "@/test/share-fixture";
import { migratedPglite } from "@/test/pglite";
import { batchChange, diffState } from "../share-client/diff";
import { inlineBackend } from "./blob-backend";
import { createMemoryStore } from "./memory-store";
import { createPostgresStore } from "./postgres-store";
import { DEFAULT_REVIEW_WINDOW_HOURS } from "./review-window";
import type { ShareServices } from "./server";
import {
  addClientComment,
  applyChanges,
  clientView,
  createShare,
  editClientComment,
  ownerShare,
  pullChanges,
  shareManifest,
} from "./service";
import type { ShareStore } from "./store";
import { hashSecret } from "./tokens";
import type { ShareRecord, ShareState } from "./types";

const HOUR = 3_600_000;
const GUEST_TOKEN = "guest-token";
const clientComment = (id: string) => ({ id, x: 5, y: 5, body: "From the client", author: "Cleo" });

async function shared(store: ShareStore = createMemoryStore()) {
  const services: ShareServices = { store, blobs: inlineBackend };
  const created = await createShare(services, STATE, 100);
  const share = await ownerShare(store, created.shareId, created.ownerKey, 100);
  if (!share) throw new Error("no share");
  return { services, share };
}

/** A client's comment `id` on `share`, posted at 200, and the key it came back with. */
async function posted(services: ShareServices, share: ShareRecord, id = "k-1") {
  const added = await addClientComment(services, share, clientComment(id), null, 200);
  if (!added.ok) throw new Error(added.error);
  return added.value.editKey;
}

/** The owner's whole state, sent the way the browser does: diffed and batched. */
async function pushState(services: ShareServices, share: ShareRecord, state: ShareState) {
  const manifest = await shareManifest(services.store, share);
  for (const batch of batchChange(diffState(state, manifest), 0)) {
    await applyChanges(services, share, batch, 500);
  }
}

describe("a client's edit key", () => {
  it("comes back once with the new comment, and only its hash is stored", async () => {
    const db = await migratedPglite();
    const { services, share } = await shared(createPostgresStore(db));
    const added = await addClientComment(services, share, clientComment("k-1"), null, 200);
    expect(added).toMatchObject({ ok: true, value: { id: "k-1", status: "active" } });
    const key = added.ok ? added.value.editKey : "";
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { rows } = await db.query<{ edit_key_hash: string; row: string }>(
      "SELECT edit_key_hash, row_to_json(c)::text AS row FROM squint_share_comments AS c WHERE id = 'k-1'",
    );
    expect(rows[0]?.edit_key_hash).toBe(hashSecret(key));
    expect(rows[0]?.row).not.toContain(key);
  });

  it("gives each comment its own key", async () => {
    const { services, share } = await shared();
    const first = await posted(services, share, "k-1");
    const second = await posted(services, share, "k-2");
    expect(first).not.toBe(second);
    const wrong = await editClientComment(services, share, "k-2", first, "Swapped", 300);
    expect(wrong).toMatchObject({ ok: false, status: 404 });
  });

  it("never shows in what the guest, the owner's pull or the manifest read", async () => {
    const { services, share } = await shared();
    const key = await posted(services, share);
    await editClientComment(services, share, "k-1", key, "Edited", 300);
    const reads = [
      await clientView(services.store, share, GUEST_TOKEN),
      await pullChanges(services.store, share, 0),
      await shareManifest(services.store, share),
      await services.store.comments(share.id),
    ];
    for (const read of reads) {
      const text = JSON.stringify(read);
      expect(text).not.toContain(key);
      expect(text).not.toContain(hashSecret(key));
      expect(text).not.toContain("editKey");
    }
  });
});

describe("editClientComment", () => {
  it("changes only the words, with the right key, and says when", async () => {
    const { services, share } = await shared();
    const key = await posted(services, share);
    const edited = await editClientComment(services, share, "k-1", key, "Bigger logo", 300);
    expect(edited).toEqual({
      ok: true,
      value: {
        ...clientComment("k-1"),
        body: "Bigger logo",
        status: "active",
        createdAt: 200,
        updatedAt: 300,
        editedAt: 300,
      },
    });
    const view = await clientView(services.store, share, GUEST_TOKEN);
    expect(view.comments.find((comment) => comment.id === "k-1")).toEqual(
      edited.ok ? edited.value : null,
    );
  });

  it("answers an unknown comment, a wrong, missing or malformed key, the same 404", async () => {
    const { services, share } = await shared();
    const key = await posted(services, share);
    const notFound = { ok: false, status: 404, error: "not-found" };
    for (const [id, presented] of [
      ["k-1", "x".repeat(43)],
      ["k-1", null],
      ["k-1", "short"],
      ["unknown", key],
      // The owner's own comment on the link: never a client's to edit.
      ["c-1", key],
    ] as const) {
      expect(await editClientComment(services, share, id, presented, "Nope", 300)).toEqual(
        notFound,
      );
    }
  });

  it("refuses another link's comment, even with its key", async () => {
    const store = createMemoryStore();
    const one = await shared(store);
    const other = await shared(store);
    const key = await posted(one.services, one.share);
    expect(
      await editClientComment(other.services, other.share, "k-1", key, "Nope", 300),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("is locked once the team resolves it, and open again once they reopen it", async () => {
    const { services, share } = await shared();
    const key = await posted(services, share);
    await services.store.setClientCommentStatus(share.id, "k-1", {
      status: "resolved",
      resolvedAt: 250,
      updatedAt: 250,
    });
    expect(await editClientComment(services, share, "k-1", key, "Too late", 300)).toEqual({
      ok: false,
      status: 409,
      error: "locked",
    });
    await services.store.setClientCommentStatus(share.id, "k-1", {
      status: "active",
      resolvedAt: null,
      updatedAt: 260,
    });
    expect(await editClientComment(services, share, "k-1", key, "Now", 400)).toMatchObject({
      ok: true,
      value: { body: "Now", status: "active" },
    });
  });

  it("is refused once the review window has closed", async () => {
    const { services, share } = await shared();
    const key = await posted(services, share);
    const closesAt = share.createdAt + DEFAULT_REVIEW_WINDOW_HOURS * HOUR;
    expect(await editClientComment(services, share, "k-1", key, "Late", closesAt)).toEqual({
      ok: false,
      status: 403,
      error: "review-closed",
    });
    const open = { ...share, reviewWindowHours: null };
    expect(await editClientComment(services, open, "k-1", key, "Fine", closesAt)).toMatchObject({
      ok: true,
    });
  });
});

describe("the owner's pull and push around a client's edit", () => {
  it("brings an edit to a comment pulled before once, marked edited", async () => {
    const { services, share } = await shared();
    const key = await posted(services, share);
    const first = await pullChanges(services.store, share, 0);
    expect(first.comments).toEqual([expect.not.objectContaining({ edited: true })]);

    await editClientComment(services, share, "k-1", key, "Bigger logo", 300);
    const second = await pullChanges(services.store, share, first.cursor);
    expect(second.comments).toEqual([
      expect.objectContaining({ id: "k-1", body: "Bigger logo", editedAt: 300, edited: true }),
    ]);
    expect(second.cursor).toBeGreaterThan(first.cursor);
    expect((await pullChanges(services.store, share, second.cursor)).comments).toEqual([]);
  });

  it("brings a comment edited before its first pull as new, once, with its latest words", async () => {
    const { services, share } = await shared();
    const key = await posted(services, share);
    await editClientComment(services, share, "k-1", key, "Bigger logo", 300);
    const pulled = await pullChanges(services.store, share, 0);
    expect(pulled.comments).toEqual([
      expect.objectContaining({ id: "k-1", body: "Bigger logo", editedAt: 300 }),
    ]);
    expect(pulled.comments[0]).not.toHaveProperty("edited");
    expect((await pullChanges(services.store, share, pulled.cursor)).comments).toEqual([]);
  });

  it("keeps the client's words when a tab that hasn't pulled the edit pushes", async () => {
    const { services, share } = await shared();
    const key = await posted(services, share);
    const first = await pullChanges(services.store, share, 0);
    await editClientComment(services, share, "k-1", key, "Bigger logo", 300);
    // The stale tab still has the words it pulled, and pushes them back.
    await pushState(services, share, {
      ...STATE,
      comments: [...STATE.comments, ...first.comments],
    });
    const view = await clientView(services.store, share, GUEST_TOKEN);
    expect(view.comments.find((comment) => comment.id === "k-1")).toMatchObject({
      body: "Bigger logo",
      editedAt: 300,
    });
  });

  it("still lets the owner delete an edited comment it has pulled", async () => {
    const { services, share } = await shared();
    const key = await posted(services, share);
    const first = await pullChanges(services.store, share, 0);
    await editClientComment(services, share, "k-1", key, "Bigger logo", 300);
    // Deleted in the workspace before the edit was pulled: the push leaves it out.
    const change = { snapshots: [], comments: [], deleteSnapshots: [], deleteComments: ["k-1"] };
    await applyChanges(services, share, { ...change, cursor: first.cursor }, 400);
    const view = await clientView(services.store, share, GUEST_TOKEN);
    expect(view.comments.map((comment) => comment.id)).toEqual(["c-1"]);
  });
});
