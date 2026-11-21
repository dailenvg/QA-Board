import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Composer } from "./Composer";
import type { Draft, SendStep } from "./types";

const DRAFT: Draft = {
  x: 10,
  y: 20,
  body: "Tighten the hero.",
  surfaceKey: "page:p1",
  snapshotId: null,
  pageId: "p1",
  commentId: "c-1",
  sending: false,
  error: null,
  crop: null,
};

const noop = () => {};

function composer(sending: SendStep, error: string | null = null): string {
  return renderToStaticMarkup(
    createElement(Composer, {
      draft: { ...DRAFT, sending, error },
      authorName: null,
      textareaRef: { current: null },
      onChange: noop,
      onAuthorChange: noop,
      onSubmit: noop,
      onCancel: noop,
    }),
  );
}

/** What the composer's live status says to screen readers. */
function status(html: string): string {
  return /data-testid="composer-status"[^>]*>([^<]*)</.exec(html)?.[1] ?? "missing";
}

describe("the composer's send status", () => {
  it("says each step of a send, and nothing between sends", () => {
    expect(status(composer(false))).toBe("");
    expect(status(composer("posting"))).toBe("Posting…");
    expect(status(composer("screenshot"))).toBe("Preparing screenshot…");
    expect(status(composer(false, "Your comment wasn't sent."))).toBe("");
  });

  it("keeps the name and words read-only while sending, and editable otherwise", () => {
    const readOnly = (html: string) => html.match(/<(?:input|textarea)[^>]*readOnly=""/g) ?? [];
    expect(readOnly(composer("posting"))).toHaveLength(2);
    expect(readOnly(composer(false, "Your comment wasn't sent."))).toHaveLength(0);
  });

  it("starts without the slow-send line: it only comes after a long wait", () => {
    expect(composer("posting")).not.toContain('data-testid="composer-slow"');
  });
});
