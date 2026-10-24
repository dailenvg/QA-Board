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

  it("shows a pending comment once, and swaps it for the server's copy", () => {
    const store = createClientStore({ ...STATE, comments: [] });
    const pending = {
      id: "k",
      projectId: SHARED_PROJECT_ID,
      x: 1,
      y: 1,
      body: "Hi",
      author: "Cleo",
      status: "active" as const,
      createdAt: 1,
      updatedAt: 1,
    };
    store.addPending(pending);
    expect(toViewerData(store.getSnapshot()).data.comments.map((c) => c.id)).toEqual(["k"]);
    // A refresh that already includes it doesn't show it twice.
    store.setView({ ...STATE, comments: [{ ...pending, createdAt: 2, updatedAt: 2 }] });
    expect(toViewerData(store.getSnapshot()).data.comments.map((c) => c.id)).toEqual(["k"]);
    store.settle("k", null);
    expect(store.getSnapshot().pending).toEqual([]);
  });
});
