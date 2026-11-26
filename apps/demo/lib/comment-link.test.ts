import { describe, expect, it } from "vitest";
import {
  parseCommentParam,
  projectCommentHref,
  projectReturnHref,
  reviewCommentHref,
  withoutCommentParam,
} from "./comment-link";

describe("comment links", () => {
  it("builds the team's link on the project and a guest's on the review link", () => {
    expect(projectCommentHref("p1", "c-1")).toBe("/p/p1?comment=c-1");
    expect(reviewCommentHref("tok_en", "c-1")).toBe("/s/tok_en?comment=c-1");
  });

  it("encodes what it's given, so an odd id never breaks the path", () => {
    expect(projectCommentHref("a/b", "c d")).toBe("/p/a%2Fb?comment=c%20d");
  });
});

describe("parseCommentParam", () => {
  it("takes an id as the API does", () => {
    expect(parseCommentParam("3f2a9c1e-7d4b-4e1a-9a6f-0c2b5d8e1f70")).toBe(
      "3f2a9c1e-7d4b-4e1a-9a6f-0c2b5d8e1f70",
    );
    expect(parseCommentParam("c_1")).toBe("c_1");
  });

  it("rejects nothing, empty and junk", () => {
    for (const value of [null, undefined, "", "a b", "../x", "<script>", "x".repeat(65)]) {
      expect(parseCommentParam(value)).toBeNull();
    }
  });
});

describe("withoutCommentParam", () => {
  it("drops the comment and keeps the rest of the query and the hash", () => {
    const url = withoutCommentParam(new URL("https://squint.test/p/p1?page=2&comment=c1#top"));
    expect(url.href).toBe("https://squint.test/p/p1?page=2#top");
  });

  it("leaves a bare path bare", () => {
    expect(withoutCommentParam(new URL("https://squint.test/s/t?comment=c1")).href).toBe(
      "https://squint.test/s/t",
    );
  });
});

describe("projectReturnHref", () => {
  it("carries a comment and a page through sign-in", () => {
    expect(projectReturnHref("p1", { comment: "c1", page: "2" })).toBe(
      "/p/p1?page=2&comment=c1",
    );
  });

  it("keeps only well-formed values, and nothing else", () => {
    expect(
      projectReturnHref("p1", { comment: "//evil.example", page: "0", next: "https://evil" }),
    ).toBe("/p/p1");
    expect(projectReturnHref("p1", { comment: ["c1", "c2"], page: "2x" })).toBe(
      "/p/p1?comment=c1",
    );
  });
});
