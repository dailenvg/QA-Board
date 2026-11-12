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
      brand: VIEW.brand,
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
