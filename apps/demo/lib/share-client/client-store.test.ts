import { describe, expect, it } from "vitest";
import { STATE } from "@/test/share-fixture";
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
