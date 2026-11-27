import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Comment } from "@/lib/store/types";
import { CommentBadge } from "./CommentBadge";
import { Composer } from "./Composer";
import { ReplyComposer } from "./ReplyComposer";
import { TeamOnlyMark } from "./TeamOnlyMark";
import type { Draft } from "./types";

const noop = () => {};
const COMMENT: Comment = {
  id: "c-1",
  projectId: "p-1",
  x: 1,
  y: 1,
  body: "Hi",
  author: "Ana",
  status: "active",
  createdAt: 1,
  updatedAt: 1,
};
const DRAFT: Draft = {
  x: 10,
  y: 20,
  body: "",
  surfaceKey: "page:p1",
  snapshotId: null,
  pageId: "p1",
  commentId: "c-1",
  sending: false,
  error: null,
  crop: null,
};
const sent = () => Promise.resolve({ ok: true as const, value: undefined });

describe("team-only marks and switches (057)", () => {
  it("reads a team-only badge as its T number, and a comment's chip and a reply's lock", () => {
    const badge = renderToStaticMarkup(
      createElement(CommentBadge, { comment: { ...COMMENT, teamOnly: true }, number: "T1" }),
    );
    expect(badge).toContain('<span class="sr-only">Team-only comment </span>');
    expect(badge).toContain("T1");
    const chip = renderToStaticMarkup(
      createElement(TeamOnlyMark, { teamOnly: true, kind: "chip" }),
    );
    expect(chip).toContain("Team only");
    const compact = renderToStaticMarkup(
      createElement(TeamOnlyMark, { teamOnly: true, kind: "compact" }),
    );
    expect(compact).toContain('title="Team only"');
    expect(
      renderToStaticMarkup(createElement(TeamOnlyMark, { teamOnly: false, kind: "chip" })),
    ).toBe("");
  });

  it("gives the team's composer a Team only switch that titles it, and a guest's none", () => {
    const props = {
      authorName: "Ana",
      textareaRef: { current: null },
      onChange: noop,
      onAuthorChange: noop,
      onPriorityChange: noop,
      onSubmit: noop,
      onCancel: noop,
    };
    const team = renderToStaticMarkup(
      createElement(Composer, {
        ...props,
        draft: { ...DRAFT, teamOnly: true },
        onTeamOnlyChange: noop,
      }),
    );
    expect(team).toContain("New team-only comment");
    expect(team).toContain('data-testid="composer-team-only"');
    expect(team).toContain('aria-checked="true"');
    const guest = renderToStaticMarkup(createElement(Composer, { ...props, draft: DRAFT }));
    expect(guest).toContain("New comment");
    expect(guest).not.toContain("composer-team-only");
  });

  it("offers the switch beside Reply under a comment clients see, and none under a team-only one", () => {
    const shown = renderToStaticMarkup(
      createElement(ReplyComposer, { authorName: "Ana", onSend: sent, visibility: "choose" }),
    );
    expect(shown).toContain('data-testid="reply-team-only-switch"');
    expect(shown).toContain('placeholder="Reply…"');
    const kept = renderToStaticMarkup(
      createElement(ReplyComposer, { authorName: "Ana", onSend: sent, visibility: "kept" }),
    );
    expect(kept).not.toContain("reply-team-only-switch");
    expect(kept).toContain('placeholder="Reply to your team…"');
    const guest = renderToStaticMarkup(
      createElement(ReplyComposer, { authorName: "Ana", onSend: sent }),
    );
    expect(guest).not.toContain("reply-team-only-switch");
  });
});
