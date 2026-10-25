import { describe, expect, it } from "vitest";
import { COMMENT, STATE } from "@/test/share-fixture";
import { createClientStore, SHARED_PROJECT_ID, toViewerData } from "./client-store";

describe("client store", () => {
  it("shows the shared project in the viewer's shape", () => {
    const store = createClientStore(STATE);
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
    };
    const { data, project } = toViewerData(createClientStore(view).getServerSnapshot());
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
    const store = createClientStore({ ...STATE, comments: [] });
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
    store.setView({ ...STATE, comments: [accepted] });
    store.addComment(accepted);
    expect(toViewerData(store.getSnapshot()).data.comments.map((c) => c.id)).toEqual(["k"]);
  });
});
