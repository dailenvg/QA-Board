import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createReplyDrafts, sendReplyDraft } from "./reply-drafts";
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

describe("sendReplyDraft", () => {
  /** A send held open until `settle` answers it, as a slow network leaves it. */
  function heldSend(): {
    post: () => Promise<{ ok: true; value: null } | { ok: false; error: string }>;
    settle: (ok: boolean) => void;
  } {
    let settle: (ok: boolean) => void = () => {};
    const answer = new Promise<boolean>((resolve) => (settle = resolve));
    return {
      post: async () => ((await answer) ? { ok: true, value: null } : { ok: false, error: "No." }),
      settle: (ok) => settle(ok),
    };
  }

  it("takes the words out of the draft as the send starts, so a box mounted meanwhile can't send them again", async () => {
    const drafts = createReplyDrafts();
    drafts.keepDraft("c-1", "Ship it.");
    const { post, settle } = heldSend();
    const sending = sendReplyDraft(drafts, "c-1", "Ship it.", post);
    // The thread moves to the card while it's sent: the card's box mounts from the draft.
    expect(drafts.draftOf("c-1")).toBe("");
    expect(box(drafts.draftOf("c-1"))).toMatch(/<textarea[^>]*><\/textarea>/);
    settle(true);
    expect((await sending).ok).toBe(true);
    expect(drafts.draftOf("c-1")).toBe("");
  });

  it("puts the words back when the send is refused, for the box to send again", async () => {
    const drafts = createReplyDrafts();
    const { post, settle } = heldSend();
    const sending = sendReplyDraft(drafts, "c-1", "Ship it.", post);
    settle(false);
    expect(await sending).toEqual({ ok: false, error: "No." });
    expect(drafts.draftOf("c-1")).toBe("Ship it.");
  });

  it("never writes over words typed meanwhile in another box", async () => {
    const drafts = createReplyDrafts();
    const { post, settle } = heldSend();
    const sending = sendReplyDraft(drafts, "c-1", "Ship it.", post);
    drafts.keepDraft("c-1", "Something else");
    settle(false);
    await sending;
    expect(drafts.draftOf("c-1")).toBe("Something else");
  });
});
