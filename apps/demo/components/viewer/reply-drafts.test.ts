import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createReplyDrafts } from "./reply-drafts";
import { ReplyComposer } from "./ReplyComposer";

/** The reply box as it mounts, from a comment's draft. */
const box = (initialBody: string) =>
  renderToStaticMarkup(
    createElement(ReplyComposer, {
      authorName: "Ana",
      onSend: () => Promise.resolve({ ok: true as const, value: null }),
      initialBody,
    }),
  );

describe("reply drafts", () => {
  it("outlive the box they were typed in: a box mounted again starts from them", () => {
    const drafts = createReplyDrafts();
    // Typed in the card's box, which then unmounts as the popover takes the thread.
    drafts.keepDraft("c-1", "Half a re");
    drafts.keepDraft("c-1", "Half a reply");
    expect(drafts.draftOf("c-1")).toBe("Half a reply");
    expect(box(drafts.draftOf("c-1"))).toMatch(/<textarea[^>]*>Half a reply<\/textarea>/);
  });

  it("are each comment's own", () => {
    const drafts = createReplyDrafts();
    drafts.keepDraft("c-1", "For the first");
    expect(drafts.draftOf("c-2")).toBe("");
  });

  it("clear once sent (the box keeps an empty body), so the next box starts empty", () => {
    const drafts = createReplyDrafts();
    drafts.keepDraft("c-1", "Sent now");
    drafts.keepDraft("c-1", "");
    expect(drafts.draftOf("c-1")).toBe("");
    expect(box(drafts.draftOf("c-1"))).toMatch(/<textarea[^>]*><\/textarea>/);
  });
});
