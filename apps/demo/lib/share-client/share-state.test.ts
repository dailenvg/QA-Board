import { describe, expect, it } from "vitest";
import { stateSchema } from "../share/schemas";
import type { Comment, Project, Snapshot } from "../store/types";
import { fromSharedComment, fromSharedSnapshot, localBlobKey, toShareState } from "./share-state";

const project: Project = {
  id: "p1",
  folderId: "f",
  name: "Checkout",
  source: {
    kind: "image",
    blobKey: "image:p1",
    fileName: "checkout.png",
    referenceUrl: "https://acme.example/",
  },
  createdAt: 1,
  updatedAt: 2,
  share: { id: "s", token: "t".repeat(43), ownerKey: "k".repeat(43), createdAt: 1, cursor: 0 },
};

const snapshot: Snapshot = {
  id: "snap",
  projectId: "p1",
  width: 1280,
  height: 900,
  createdAt: 3,
  blobKey: "snapshot:snap",
  sourceUrl: "https://acme.example/",
};

const comment: Comment = {
  id: "c1",
  projectId: "p1",
  x: 10,
  y: 20,
  body: "x".repeat(6000),
  author: "Ana",
  status: "resolved",
  createdAt: 4,
  updatedAt: 4,
  resolvedAt: 5,
  snapshotId: "snap",
  crop: { blobKey: "crop:c1", rect: { x: 0, y: 0, width: 10, height: 10 } },
};

describe("toShareState", () => {
  const state = toShareState(project, [comment], [snapshot]);

  it("sends no secrets or local keys, and fits the server's schema", () => {
    expect(JSON.stringify(state)).not.toMatch(/blobKey|ownerKey|token|projectId/);
    expect(stateSchema.safeParse(state).success).toBe(true);
    expect(state.project.source).toEqual({
      kind: "image",
      fileName: "checkout.png",
      referenceUrl: "https://acme.example/",
    });
    expect(state.comments[0]).toMatchObject({
      status: "resolved",
      resolvedAt: 5,
      crop: { rect: comment.crop?.rect },
    });
  });

  it("trims comment text that predates the length limit instead of failing the push", () => {
    expect(state.comments[0]?.body).toHaveLength(5000);
  });

  it("round-trips comments and snapshots back to local records", () => {
    const [shared] = state.comments;
    if (!shared) throw new Error("no comment");
    expect(fromSharedComment(shared, "p1")).toEqual({ ...comment, body: shared.body });
    const [sharedSnapshot] = state.snapshots;
    if (!sharedSnapshot) throw new Error("no snapshot");
    expect(fromSharedSnapshot(sharedSnapshot, "p1")).toEqual(snapshot);
    expect(localBlobKey("image", "p1")).toBe("image:p1");
    expect(localBlobKey("crop:c1", "p1")).toBe("crop:c1");
  });
});
