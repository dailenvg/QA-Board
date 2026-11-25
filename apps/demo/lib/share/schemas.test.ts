import { describe, expect, it } from "vitest";
import { COMMENT, REPLY, STATE } from "@/test/share-fixture";
import {
  blobKeySchema,
  changeSchema,
  clientCommentSchema,
  clientEditSchema,
  SHARE_LIMITS,
  stateSchema,
} from "./schemas";

const valid = (value: unknown) => stateSchema.safeParse(value).success;

describe("share schemas", () => {
  it("accept the fixture state", () => {
    expect(valid(STATE)).toBe(true);
  });

  it("cap names, authors and comment text", () => {
    const project = { ...STATE.project, name: "x".repeat(SHARE_LIMITS.projectName + 1) };
    expect(valid({ ...STATE, project })).toBe(false);
    const long = { ...COMMENT, body: "x".repeat(SHARE_LIMITS.body + 1) };
    expect(valid({ ...STATE, comments: [long] })).toBe(false);
    const author = { ...COMMENT, author: "x".repeat(SHARE_LIMITS.author + 1) };
    expect(valid({ ...STATE, comments: [author] })).toBe(false);
    expect(valid({ ...STATE, comments: [{ ...COMMENT, body: "   " }] })).toBe(false);
  });

  it("cap how many snapshots and comments a share holds", () => {
    const comments = Array.from({ length: SHARE_LIMITS.comments + 1 }, (_, index) => ({
      ...COMMENT,
      id: `c${index}`,
    }));
    expect(valid({ ...STATE, comments })).toBe(false);
  });

  it("accept only http(s) addresses and well-formed ids", () => {
    const source = { kind: "url", url: "javascript:alert(1)" };
    expect(valid({ ...STATE, project: { ...STATE.project, source } })).toBe(false);
    expect(valid({ ...STATE, comments: [{ ...COMMENT, id: "../x" }] })).toBe(false);
    expect(valid({ ...STATE, comments: [{ ...COMMENT, x: 101 }] })).toBe(false);
  });

  it("strip what only the server says of a comment from anything a browser pushes or posts", () => {
    const planted = {
      ...COMMENT,
      mine: true,
      team: true,
      authorAvatar: "/api/s/t/people/AAAAAAAAAAAAAAAAAAAAAA/avatar?v=1",
    };
    const pushed = [
      stateSchema.parse({ ...STATE, comments: [planted] }).comments[0],
      changeSchema.parse({ comments: [planted], cursor: 0 }).comments[0],
      clientCommentSchema.parse(planted),
    ];
    for (const comment of pushed) {
      for (const field of ["mine", "team", "authorAvatar"]) {
        expect(comment).not.toHaveProperty(field);
      }
    }
  });

  it("cap a reply's words, author and ids, and how many replies a link holds", () => {
    expect(valid({ ...STATE, replies: [REPLY] })).toBe(true);
    for (const reply of [
      { ...REPLY, body: "x".repeat(SHARE_LIMITS.body + 1) },
      { ...REPLY, body: "  " },
      { ...REPLY, author: "x".repeat(SHARE_LIMITS.author + 1) },
      { ...REPLY, commentId: "../x" },
      { ...REPLY, createdAt: -1 },
    ]) {
      expect(valid({ ...STATE, replies: [reply] })).toBe(false);
    }
    const replies = Array.from({ length: SHARE_LIMITS.replies + 1 }, (_, index) => ({
      ...REPLY,
      id: `r${index}`,
    }));
    expect(valid({ ...STATE, replies })).toBe(false);
    expect(changeSchema.safeParse({ replies, cursor: 0 }).success).toBe(false);
  });

  it("strip whose a reply is and the browser it was posted from from anything pushed", () => {
    const planted = {
      ...REPLY,
      projectId: "p1",
      mine: true,
      team: true,
      fromClient: true,
      authorAvatar: "/api/w/ws-1/people/AAAAAAAAAAAAAAAAAAAAAA/avatar?v=1",
      clientInfo: { userAgent: "Mozilla/5.0", viewport: { width: 1440, height: 900 } },
    };
    const pushed = [
      stateSchema.parse({ ...STATE, replies: [planted] }).replies[0],
      changeSchema.parse({ replies: [planted], cursor: 0 }).replies[0],
    ];
    for (const reply of pushed) expect(reply).toEqual(REPLY);
  });

  it("read a push from a browser that predates replies as having none", () => {
    const { replies: _none, ...older } = STATE;
    expect(stateSchema.parse(older).replies).toEqual([]);
    expect(changeSchema.parse({ cursor: 0 })).toMatchObject({ replies: [], deleteReplies: [] });
  });

  it("let clients set neither status nor timestamps", () => {
    const parsed = clientCommentSchema.parse({ ...COMMENT });
    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("createdAt");
  });

  it("accept only known blob keys", () => {
    for (const key of ["page:page-1", "page:page-1:3", "snapshot:abc-1", "crop:c_1"]) {
      expect(blobKeySchema.safeParse(key).success).toBe(true);
    }
    for (const key of [
      "image",
      "page:",
      "page:p:x",
      "crop:",
      "crop:../x",
      "snapshot:a/b",
      "other:1",
    ]) {
      expect(blobKeySchema.safeParse(key).success).toBe(false);
    }
  });

  it("accept page projects with 1 to 50 uniquely named pages", () => {
    const page = { id: "p1", name: "home.png", width: 1200, height: 900 };
    const pages = (list: unknown[]) => ({
      ...STATE,
      project: {
        name: "Mockups",
        source: { kind: "pages", origin: "image", fileName: "home.png", pages: list },
      },
    });
    expect(valid(pages([page, { id: "p2", name: "about.png" }]))).toBe(true);
    expect(valid(pages([]))).toBe(false);
    expect(valid(pages([page, page]))).toBe(false);
    expect(valid(pages([{ ...page, height: undefined }]))).toBe(false);
    expect(valid(pages([{ ...page, id: "../x" }]))).toBe(false);
    const many = Array.from({ length: SHARE_LIMITS.pages + 1 }, (_, index) => ({
      id: `p${index}`,
      name: "x",
    }));
    expect(valid(pages(many))).toBe(false);
    // The image source from before pages is gone.
    const legacy = { kind: "image", fileName: "home.png" };
    expect(valid({ ...STATE, project: { name: "Old", source: legacy } })).toBe(false);
  });

  it("let a guest pick a priority when posting, and the owner push one, and nothing else", () => {
    expect(clientCommentSchema.parse({ ...COMMENT, priority: "nit" })).toMatchObject({
      priority: "nit",
    });
    expect(clientCommentSchema.parse({ ...COMMENT })).not.toHaveProperty("priority");
    for (const priority of ["Nit", "urgent", null, 1]) {
      expect(clientCommentSchema.safeParse({ ...COMMENT, priority }).success).toBe(false);
    }
    expect(valid({ ...STATE, comments: [{ ...COMMENT, priority: "must" }] })).toBe(true);
    expect(valid({ ...STATE, comments: [{ ...COMMENT, priority: "high" }] })).toBe(false);
    // An edit is the words alone (D10): a priority sent with one is dropped.
    expect(clientEditSchema.parse({ body: "New", priority: "must" })).toEqual({ body: "New" });
  });

  it("let clients name the page a comment is on", () => {
    expect(clientCommentSchema.parse({ ...COMMENT, pageId: "p1" })).toMatchObject({ pageId: "p1" });
    expect(clientCommentSchema.safeParse({ ...COMMENT, pageId: "a/b" }).success).toBe(false);
  });
});
