import { describe, expect, it } from "vitest";
import { COMMENT, namesInMemory, STATE, VIEW } from "@/test/share-fixture";
import { createClientStore, SHARED_PROJECT_ID, toViewerData } from "./client-store";

const anonymous = () => ({ authorName: null, names: namesInMemory() });

describe("client store", () => {
  it("shows the shared project in the viewer's shape", () => {
    const store = createClientStore(VIEW, anonymous());
    const { data, project } = toViewerData(store.getServerSnapshot());
    expect(project).toMatchObject({
      id: SHARED_PROJECT_ID,
      name: "Acme",
      source: STATE.project.source,
    });
    expect(data.comments[0]).toMatchObject({
      id: "c-1",
      projectId: SHARED_PROJECT_ID,
      crop: { blobKey: "crop:c-1" },
    });
    expect(data.snapshots[0]).toMatchObject({ id: "snap-1", blobKey: "snapshot:snap-1" });
    expect(data.folders).toEqual([]);
  });

  it("reads each shared page's picture through its share key, and keeps comments' pages", () => {
    const view = {
      project: {
        name: "Mockups",
        source: {
          kind: "pages" as const,
          origin: "image" as const,
          fileName: "home.png",
          pages: [
            { id: "p1", name: "home.png", width: 1200, height: 900 },
            { id: "p2", name: "about.png" },
          ],
        },
      },
      snapshots: [],
      comments: [{ ...COMMENT, id: "k", snapshotId: undefined, pageId: "p2" }],
      replies: [],
      brand: VIEW.brand,
      clientName: null,
      reviewEndsAt: VIEW.reviewEndsAt,
      reviewWindowHours: VIEW.reviewWindowHours,
      expiresAt: VIEW.expiresAt,
    };
    const { data, project } = toViewerData(
      createClientStore(view, anonymous()).getServerSnapshot(),
    );
    expect(project.source).toEqual({
      ...view.project.source,
      pages: [
        { id: "p1", name: "home.png", width: 1200, height: 900, blobKey: "page:p1" },
        { id: "p2", name: "about.png", blobKey: "page:p2" },
      ],
    });
    expect(data.version).toBe(3);
    expect(data.comments[0]).toMatchObject({ id: "k", pageId: "p2" });
  });

  it("gives the viewer every reply, under the shared project, as the server marked it", () => {
    const team = {
      id: "r-1",
      commentId: COMMENT.id,
      body: "On it.",
      author: "Ana",
      createdAt: 3,
      team: true as const,
      authorAvatar: "/api/s/t/people/AAAAAAAAAAAAAAAAAAAAAA/avatar?v=1",
    };
    const client = {
      id: "r-2",
      commentId: COMMENT.id,
      body: "Thanks",
      author: "Cleo",
      createdAt: 4,
    };
    const store = createClientStore({ ...VIEW, replies: [team, client] }, anonymous());
    expect(toViewerData(store.getServerSnapshot()).data.replies).toEqual([
      { ...team, projectId: SHARED_PROJECT_ID },
      { ...client, projectId: SHARED_PROJECT_ID },
    ]);
  });

  it("adds an accepted comment once, even if a refresh brought it first", () => {
    const store = createClientStore({ ...VIEW, comments: [] }, anonymous());
    const accepted = {
      id: "k",
      x: 1,
      y: 1,
      body: "Hi",
      author: "Cleo",
      status: "active" as const,
      createdAt: 1,
      updatedAt: 1,
    };
    store.setView({ ...VIEW, comments: [accepted] });
    store.addComment(accepted);
    expect(toViewerData(store.getSnapshot()).data.comments.map((c) => c.id)).toEqual(["k"]);
  });

  it("adds an accepted reply once, even if a refresh brought it first", () => {
    const store = createClientStore(VIEW, anonymous());
    const accepted = { id: "k-r", commentId: "c-1", body: "Thanks!", author: "Cleo", createdAt: 9 };
    store.addReply(accepted);
    expect(toViewerData(store.getSnapshot()).data.replies).toEqual([
      { ...accepted, projectId: SHARED_PROJECT_ID },
    ]);
    store.setView({ ...VIEW, replies: [accepted] });
    store.addReply(accepted);
    expect(toViewerData(store.getSnapshot()).data.replies.map((r) => r.id)).toEqual(["k-r"]);
  });
});

describe("the review window", () => {
  it("stays closed once the server said so, until a refresh brings a new deadline", () => {
    const store = createClientStore(VIEW, anonymous());
    store.markReviewClosed();
    store.setView({ ...VIEW, comments: [] });
    expect(store.getSnapshot().reviewClosed).toBe(true);
    // The owner chose a longer window, or no limit: the server's new deadline reopens it.
    store.setView({ ...VIEW, reviewEndsAt: null, reviewWindowHours: null });
    expect(store.getSnapshot().reviewClosed).toBe(false);
  });
});

describe("the password", () => {
  it("locks the review when the link asks for it again, and only then", () => {
    const store = createClientStore(VIEW, anonymous());
    expect(store.getServerSnapshot().locked).toBe(false);
    let told = 0;
    store.subscribe(() => (told += 1));
    store.markLocked();
    expect(store.getSnapshot().locked).toBe(true);
    expect(told).toBe(1);
  });
});

describe("the reviewer's name", () => {
  it("is in the state the server renders with, so the name isn't asked for again", () => {
    const store = createClientStore(VIEW, { authorName: "Cleo", names: namesInMemory() });
    expect(store.getServerSnapshot().authorName).toBe("Cleo");
    expect(store.getSnapshot()).toBe(store.getServerSnapshot());
    expect(toViewerData(store.getServerSnapshot()).data.authorName).toBe("Cleo");
  });

  it("is remembered for the link when set", () => {
    const names = namesInMemory();
    const store = createClientStore(VIEW, { authorName: null, names });
    store.setAuthorName("Cleo");
    expect(names.saved).toEqual(["Cleo"]);
    expect(store.getSnapshot().authorName).toBe("Cleo");
  });

  it("carries the browser's old name over once, when the link has none", () => {
    const names = namesInMemory("Ana");
    const store = createClientStore(VIEW, { authorName: null, names });
    let changes = 0;
    store.subscribe(() => (changes += 1));
    store.carryOverAuthorName();
    store.carryOverAuthorName();
    expect(store.getSnapshot().authorName).toBe("Ana");
    expect(names.saved).toEqual(["Ana"]);
    expect(changes).toBe(1);
  });

  it("keeps the link's own name over the old one", () => {
    const names = namesInMemory("Ana");
    const store = createClientStore(VIEW, { authorName: "Cleo", names });
    store.carryOverAuthorName();
    expect(store.getSnapshot().authorName).toBe("Cleo");
    expect(names.saved).toEqual([]);
  });
});

describe("this browser's own comments (4.12)", () => {
  const KEY = "k".repeat(43);

  /** Edit keys kept in a list, as one link's storage would hold them. */
  function keysInMemory(held: Record<string, string> = {}) {
    const keys = new Map(Object.entries(held));
    return {
      ids: () => [...keys.keys()],
      keyOf: (id: string) => keys.get(id) ?? null,
      save: (id: string, key: string) => void keys.set(id, key),
    };
  }

  it("knows none on the server's render, then reads them from storage", () => {
    const store = createClientStore(VIEW, {
      authorName: null,
      names: namesInMemory(),
      editKeys: keysInMemory({ [COMMENT.id]: KEY }),
    });
    expect(toViewerData(store.getServerSnapshot()).data.comments[0]).not.toHaveProperty("mine");
    store.loadOwnComments();
    expect(toViewerData(store.getSnapshot()).data.comments[0]).toMatchObject({ mine: true });
    expect(store.editKeyOf(COMMENT.id)).toBe(KEY);
  });

  it("makes a comment it posts its own, keeping the key out of the view", () => {
    const editKeys = keysInMemory();
    const store = createClientStore(
      { ...VIEW, comments: [] },
      { authorName: null, names: namesInMemory(), editKeys },
    );
    store.addComment({ ...COMMENT, id: "k" }, KEY);
    expect(editKeys.keyOf("k")).toBe(KEY);
    expect(toViewerData(store.getSnapshot()).data.comments).toEqual([
      expect.objectContaining({ id: "k", mine: true }),
    ]);
    expect(JSON.stringify(store.getSnapshot().view)).not.toContain(KEY);
  });

  it("keeps a comment read-only when its key couldn't be stored (storage blocked)", () => {
    const blocked = { ids: () => [], keyOf: () => null, save: () => {} };
    const store = createClientStore(
      { ...VIEW, comments: [] },
      { authorName: null, names: namesInMemory(), editKeys: blocked },
    );
    store.addComment({ ...COMMENT, id: "k" }, KEY);
    expect(store.getSnapshot().ownComments.size).toBe(0);
    expect(toViewerData(store.getSnapshot()).data.comments[0]).not.toHaveProperty("mine");
  });

  it("says whether a link that stopped working is gone or only paused", () => {
    const gone = createClientStore(VIEW, anonymous());
    gone.markGone();
    expect(gone.getSnapshot()).toMatchObject({ gone: true, paused: false });
    const paused = createClientStore(VIEW, anonymous());
    paused.markGone(true);
    expect(paused.getSnapshot()).toMatchObject({ gone: true, paused: true });
    expect(paused.getServerSnapshot()).toMatchObject({ gone: false, paused: false });
  });

  it("replaces a comment's words in place, and ignores one that's gone", () => {
    const store = createClientStore(VIEW, { authorName: null, names: namesInMemory() });
    store.replaceComment({ ...COMMENT, body: "New words", editedAt: 9 });
    store.replaceComment({ ...COMMENT, id: "gone", body: "Nope" });
    expect(store.getSnapshot().view.comments).toEqual([
      { ...COMMENT, body: "New words", editedAt: 9 },
    ]);
  });
});
