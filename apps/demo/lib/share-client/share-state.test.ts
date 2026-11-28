import { describe, expect, it } from "vitest";
import { stateSchema } from "../share/schemas";
import type { Comment, Project, Reply, Snapshot } from "../store/types";
import { diffState } from "./diff";
import {
  fromSharedComment,
  fromSharedSnapshot,
  localBlobKey,
  teamOnlyIds,
  toShareState,
} from "./share-state";

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
  share: {
    id: "s",
    token: "t".repeat(43),
    ownerKey: "k".repeat(43),
    createdAt: 1,
    cursor: 0,
    reviewWindowHours: null,
    reviewEndsAt: null,
  },
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

/** A reply to `comment` with everything the workspace knows of it, by Ben. */
const reply: Reply = {
  id: "r1",
  projectId: "p1",
  commentId: "c1",
  body: "  On it.  ",
  author: "Ben",
  createdAt: 7,
  editedAt: 8,
  mine: true,
  authorAvatar: "/api/w/ws-1/people/AAAAAAAAAAAAAAAAAAAAAA/avatar?v=1",
  clientInfo: { userAgent: "Mozilla/5.0", viewport: { width: 1440, height: 900 }, dpr: 2 },
};

describe("toShareState's replies", () => {
  it("pushes the replies to the comments it pushes, of this project only, and nothing else", () => {
    const replies: Reply[] = [
      reply,
      { ...reply, id: "r2", commentId: "c2", fromClient: true, mine: undefined, createdAt: 9 },
      { ...reply, id: "r3", commentId: "not-shared" },
      { ...reply, id: "r4", projectId: "p2" },
    ];
    const state = toShareState(project, [comment], [], replies);
    expect(state.replies).toEqual([
      { id: "r1", commentId: "c1", body: "On it.", author: "Ben", createdAt: 7, editedAt: 8 },
    ]);
    expect(toShareState(project, [comment, pageComment], [], replies).replies).toEqual([
      expect.objectContaining({ id: "r1" }),
      { id: "r2", commentId: "c2", body: "On it.", author: "Ben", createdAt: 9, editedAt: 8 },
    ]);
  });

  it("never pushes a reply's browser details, so they never reach a link", () => {
    const pushed = toShareState(project, [comment], [], [reply]);
    expect(JSON.stringify(pushed)).not.toMatch(/clientInfo|Mozilla|viewport|dpr/);
    const { clientInfo: _info, ...without } = reply;
    expect(pushed).toEqual(toShareState(project, [comment], [], [without]));
  });

  it("trims and caps a reply as the server stores it, so its digest matches", () => {
    const long = { ...reply, body: "x".repeat(6000), author: "   " };
    const state = toShareState(project, [comment], [], [long]);
    expect(state.replies[0]).toMatchObject({ body: "x".repeat(5000), author: "Reviewer" });
    expect(stateSchema.parse(state).replies).toEqual(state.replies);
  });
});

describe("toShareState", () => {
  const state = toShareState(project, [comment], [snapshot], []);

  it("sends no secrets or local keys, and fits the server's schema", () => {
    expect(JSON.stringify(state)).not.toMatch(/blobKey|ownerKey|token|projectId/);
    // Whose a comment is stays in the workspace: guests never see it, nor the app's avatar URL.
    const avatar = "/api/w/ws-1/people/AAAAAAAAAAAAAAAAAAAAAA/avatar?v=1";
    const own = toShareState(
      project,
      [{ ...comment, mine: true, team: true, authorAvatar: avatar }],
      [snapshot],
      [],
    );
    for (const field of ["mine", "team", "authorAvatar"]) {
      expect(own.comments[0]).not.toHaveProperty(field);
    }
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

  it("never pushes browser details, the team's own or a client's pulled ones", () => {
    const clientInfo = { userAgent: "Mozilla/5.0", viewport: { width: 1440, height: 900 }, dpr: 2 };
    const pushed = toShareState(
      project,
      [
        { ...comment, clientInfo },
        { ...pageComment, fromClient: true, clientInfo },
      ],
      [snapshot],
      [],
    );
    expect(JSON.stringify(pushed)).not.toMatch(/clientInfo|Mozilla/);
    // The same push as without them, so the manifest's digests don't change either.
    const without = toShareState(
      project,
      [comment, { ...pageComment, fromClient: true }],
      [snapshot],
      [],
    );
    expect(pushed).toEqual(without);
  });

  it("leaves out team-only comments, every reply under one, and team-only replies (057)", () => {
    const reply = (id: string, commentId: string, teamOnly?: true): Reply => ({
      id,
      projectId: "p1",
      commentId,
      body: "Yes",
      author: "Leo",
      createdAt: 7,
      ...(teamOnly ? { teamOnly } : {}),
    });
    const pushed = toShareState(
      project,
      [comment, { ...pageComment, teamOnly: true }],
      [],
      [reply("r1", "c1"), reply("r2", "c1", true), reply("r3", "c2")],
    );
    expect(pushed.comments.map((shared) => shared.id)).toEqual(["c1"]);
    expect(pushed.replies.map((shared) => shared.id)).toEqual(["r1"]);
    expect(JSON.stringify(pushed)).not.toContain("teamOnly");
  });

  it("never asks the link to delete what the owner keeps to the team: the server takes it off (D10)", () => {
    const hidden: Comment = { ...pageComment, teamOnly: true };
    const replies: Reply[] = [
      { id: "r-under", projectId: "p1", commentId: "c2", body: "Hm", author: "Leo", createdAt: 7 },
      {
        id: "r-kept",
        projectId: "p1",
        commentId: "c1",
        body: "Us",
        author: "Leo",
        createdAt: 8,
        teamOnly: true,
      },
      { id: "r-shown", projectId: "p1", commentId: "c1", body: "Ok", author: "Leo", createdAt: 9 },
    ];
    const kept = teamOnlyIds("p1", [comment, hidden], replies);
    expect([...kept].sort()).toEqual(["c2", "r-kept", "r-under"]);
    const state = toShareState(project, [comment, hidden], [], replies);
    // The link still has them all, as before the change reached the server.
    const manifest = {
      project: "",
      snapshots: [],
      comments: ["c1", "c2", "gone"].map((id) => ({ id, digest: "" })),
      replies: ["r-under", "r-kept", "r-shown"].map((id) => ({ id, digest: "" })),
      missingBlobs: [],
      expiresAt: null,
    };
    const changes = diffState(state, manifest, new Set(), kept);
    expect(changes.deleteComments).toEqual(["gone"]);
    expect(changes.deleteReplies).toEqual([]);
  });

  it("keeps a pulled comment's browser details in the workspace", () => {
    const clientInfo = { userAgent: "Mozilla/5.0", dpr: 3 };
    const [shared] = toShareState(project, [pageComment], [], []).comments;
    if (!shared) throw new Error("no comment");
    expect(fromSharedComment({ ...shared, clientInfo }, "p1")).toEqual({
      ...pageComment,
      clientInfo,
    });
  });

  it("carries each comment's page", () => {
    const [shared] = toShareState(project, [pageComment], [], []).comments;
    expect(shared).toMatchObject({ id: "c2", pageId: "pg2" });
    if (!shared) throw new Error("no comment");
    expect(fromSharedComment(shared, "p1")).toEqual(pageComment);
  });

  it("pushes each comment's priority, and leaves it out for none (D26)", () => {
    const marked: Comment = { ...pageComment, priority: "must", fromClient: true };
    const { comments } = toShareState(project, [marked, comment], [], []);
    expect(comments[0]).toMatchObject({ id: "c2", priority: "must" });
    expect(comments[1]).not.toHaveProperty("priority");
    expect(stateSchema.safeParse(toShareState(project, [marked], [], [])).success).toBe(true);
    if (!comments[0]) throw new Error("no comment");
    // A guest's pick, pulled, keeps its priority in the workspace.
    expect(fromSharedComment(comments[0], "p1")).toMatchObject({ priority: "must" });
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
    expect(toShareState(replaced, [], [], []).project.source).toMatchObject({
      pages: [{ id: "page-1" }, { id: "pg2", rev: 2 }],
    });
    expect(localBlobKey("page:pg2:2", replaced)).toBe("page:pg2");
    expect(localBlobKey("page:pg2:1", replaced)).toBeNull();
    expect(localBlobKey("page:pg2", replaced)).toBeNull();
  });
});
