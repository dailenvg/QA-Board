import { describe, expect, it } from "vitest";
import { stateSchema } from "../share/schemas";
import type { Comment, Project, Snapshot } from "../store/types";
import { fromSharedComment, fromSharedSnapshot, localBlobKey, toShareState } from "./share-state";

const project: Project = {
  id: "p1",
  folderId: "f",
  name: "Checkout",
  source: {
    kind: "pages",
    origin: "image",
    pages: [
      { id: "page-1", blobKey: "image:p1", name: "checkout.png" },
      { id: "pg2", blobKey: "page:pg2", name: "  ", width: 1200, height: 900 },
    ],
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

const pageComment: Comment = {
  id: "c2",
  projectId: "p1",
  x: 50,
  y: 50,
  body: "On page two",
  author: "Leo",
  status: "active",
  createdAt: 6,
  updatedAt: 6,
  pageId: "pg2",
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
      kind: "pages",
      origin: "image",
      fileName: "checkout.png",
      referenceUrl: "https://acme.example/",
      pages: [
        { id: "page-1", name: "checkout.png" },
        // A blank name gets one; the size travels when it's known.
        { id: "pg2", name: "Page 2", width: 1200, height: 900 },
      ],
    });
    expect(state.comments[0]).toMatchObject({
      status: "resolved",
      resolvedAt: 5,
      crop: { rect: comment.crop?.rect },
    });
  });

  it("carries each comment's page", () => {
    const [shared] = toShareState(project, [pageComment], []).comments;
    expect(shared).toMatchObject({ id: "c2", pageId: "pg2" });
    if (!shared) throw new Error("no comment");
    expect(fromSharedComment(shared, "p1")).toEqual(pageComment);
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
    expect(localBlobKey("crop:c1", project)).toBe("crop:c1");
  });

  it("round-trips a snapshot of another page of the site, so its comments stay on that page", () => {
    const site: Project = { ...project, source: { kind: "url", url: "https://acme.example/" } };
    const pricing: Snapshot = { ...snapshot, sourceUrl: "https://acme.example/pricing?plan=pro" };
    const shared = toShareState(site, [comment], [pricing]);
    expect(stateSchema.safeParse(shared).success).toBe(true);
    const [sharedSnapshot] = shared.snapshots;
    if (!sharedSnapshot) throw new Error("no snapshot");
    expect(fromSharedSnapshot(sharedSnapshot, "p1")).toEqual(pricing);
  });

  it("finds each shared page's picture wherever this browser keeps it", () => {
    expect(localBlobKey("page:page-1", project)).toBe("image:p1");
    expect(localBlobKey("page:pg2", project)).toBe("page:pg2");
    expect(localBlobKey("page:unknown", project)).toBeNull();
  });

  it("keys a replaced page by its revision, so only the current picture is sent", () => {
    if (project.source.kind !== "pages") throw new Error("fixture");
    const [first, second] = project.source.pages;
    if (!first || !second) throw new Error("fixture");
    const replaced: Project = {
      ...project,
      source: { ...project.source, pages: [first, { ...second, rev: 2 }] },
    };
    expect(toShareState(replaced, [], []).project.source).toMatchObject({
      pages: [{ id: "page-1" }, { id: "pg2", rev: 2 }],
    });
    expect(localBlobKey("page:pg2:2", replaced)).toBe("page:pg2");
    expect(localBlobKey("page:pg2:1", replaced)).toBeNull();
    expect(localBlobKey("page:pg2", replaced)).toBeNull();
  });
});
