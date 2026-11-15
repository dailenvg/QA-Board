import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Comment } from "@/lib/store/types";
import { commentRights, type CommentViewer } from "./comment-rights";
import { CommentCard } from "./CommentCard";
import { PinPopover } from "./PinPopover";

const MINUTE = 60_000;
const NOW = 10 * MINUTE;
const COMMENT: Comment = {
  id: "c-1",
  projectId: "p-1",
  x: 10,
  y: 20,
  body: "Tighten the hero.",
  author: "Ben",
  status: "active",
  createdAt: MINUTE,
  updatedAt: MINUTE,
};

const noop = () => {};
const owner: CommentViewer = { team: true, moderator: true };
const member: CommentViewer = { team: true, moderator: false };

function card(comment: Comment, viewer: CommentViewer = member): string {
  const rights = commentRights(comment, viewer);
  return renderToStaticMarkup(
    createElement(CommentCard, {
      comment,
      number: 1,
      placement: null,
      pageNumber: null,
      canModerate: viewer.team,
      canEdit: rights.edit,
      canDelete: rights.delete !== null,
      selected: false,
      now: NOW,
      onSelect: noop,
      onEdit: noop,
      onResolve: noop,
      onReopen: noop,
      onDelete: noop,
    }),
  );
}

function popover(comment: Comment): string {
  return renderToStaticMarkup(
    createElement(PinPopover, {
      id: "popover",
      comment,
      number: 1,
      placement: null,
      now: NOW,
      canModerate: true,
      onResolve: noop,
      onReopen: noop,
      onClose: noop,
    }),
  );
}

const EDIT = 'aria-label="Edit comment 1"';
const DELETE = 'aria-label="Delete comment 1"';

describe("the comment card's actions", () => {
  it("shows Edit and Delete on the member's own comment", () => {
    const html = card({ ...COMMENT, mine: true });
    expect(html).toContain(EDIT);
    expect(html).toContain(DELETE);
  });

  it("hides both on someone else's for a member, and keeps Resolve", () => {
    const html = card(COMMENT);
    expect(html).not.toContain(EDIT);
    expect(html).not.toContain(DELETE);
    expect(html).toContain("Resolve");
  });

  it("shows the owner Delete, never Edit, on someone else's and a client's", () => {
    for (const comment of [COMMENT, { ...COMMENT, fromClient: true as const }]) {
      const html = card(comment, owner);
      expect(html).not.toContain(EDIT);
      expect(html).toContain(DELETE);
    }
  });
});

describe("the Edited line", () => {
  it.each([
    ["comment card", (comment: Comment) => card(comment)],
    ["pin popover", popover],
  ])("on a %s follows editedAt, with its time, never updatedAt", (_name, render) => {
    // Resolved or cropped since posting, words unchanged: no line.
    expect(render({ ...COMMENT, updatedAt: NOW })).not.toContain("Edited");
    const html = render({ ...COMMENT, updatedAt: NOW, editedAt: NOW - 5 * MINUTE });
    expect(html).toContain('data-testid="comment-edited"');
    expect(html).toMatch(/Edited <time[^>]*>5 minutes ago<\/time>/);
    expect(html).toContain(`dateTime="${new Date(NOW - 5 * MINUTE).toISOString()}"`);
  });

  it.each([
    ["comment card", (comment: Comment) => card(comment)],
    ["pin popover", popover],
  ])(
    "on a %s never says a time to come when this clock is behind the server's",
    (_name, render) => {
      const ahead = NOW + 2 * MINUTE;
      const html = render({ ...COMMENT, editedAt: ahead });
      expect(html).toMatch(/Edited <time[^>]*>just now<\/time>/);
      expect(html).not.toContain("in 2 minutes");
      expect(html).toContain(`dateTime="${new Date(ahead).toISOString()}"`);
    },
  );
});
