import { describe, expect, it } from "vitest";
import { COMMENT, STATE } from "@/test/share-fixture";
import { blobKeySchema, clientCommentSchema, SHARE_LIMITS, stateSchema } from "./schemas";

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

  it("let clients set neither status nor timestamps", () => {
    const parsed = clientCommentSchema.parse({ ...COMMENT });
    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("createdAt");
  });

  it("accept only known blob keys", () => {
    for (const key of ["page:page-1", "snapshot:abc-1", "crop:c_1"]) {
      expect(blobKeySchema.safeParse(key).success).toBe(true);
    }
    for (const key of ["image", "page:", "crop:", "crop:../x", "snapshot:a/b", "other:1"]) {
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

  it("let clients name the page a comment is on", () => {
    expect(clientCommentSchema.parse({ ...COMMENT, pageId: "p1" })).toMatchObject({ pageId: "p1" });
    expect(clientCommentSchema.safeParse({ ...COMMENT, pageId: "a/b" }).success).toBe(false);
  });
});
