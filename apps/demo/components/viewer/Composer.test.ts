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

function composer(
  sending: SendStep,
  error: string | null = null,
  draft: Partial<Draft> = {},
): string {
  return renderToStaticMarkup(
    createElement(Composer, {
      draft: { ...DRAFT, ...draft, sending, error },
      authorName: null,
      textareaRef: { current: null },
      onChange: noop,
      onAuthorChange: noop,
      onPriorityChange: noop,
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
    expect(status(composer("screenshot"))).toBe("Adding screenshot…");
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

describe("the composer's priority", () => {
  /** Each radio's label and whether it's checked, in order. */
  function radios(html: string): Array<[string, boolean]> {
    const group = /role="radiogroup" aria-label="Priority"[^>]*>(.*?)<\/div>/.exec(html)?.[1] ?? "";
    return [...group.matchAll(/role="radio" aria-checked="(true|false)".*?<\/button>/g)].map(
      (match) => [match[0].replace(/^[^>]*>/, "").replace(/<[^>]+>/g, ""), match[1] === "true"],
    );
  }

  it("offers None, Must fix, Should fix and Nit, with None picked for a new comment (D9)", () => {
    expect(radios(composer(false))).toEqual([
      ["None", true],
      ["Must fix", false],
      ["Should fix", false],
      ["Nit", false],
    ]);
  });

  it("shows the draft's own pick, kept with it", () => {
    expect(radios(composer(false, null, { priority: "should" }))).toEqual([
      ["None", false],
      ["Must fix", false],
      ["Should fix", true],
      ["Nit", false],
    ]);
  });
});
