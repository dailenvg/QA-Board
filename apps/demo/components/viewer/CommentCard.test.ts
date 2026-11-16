import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Comment } from "@/lib/store/types";
import { CommentPeopleContext, type CommentPeople } from "./comment-people";
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

/** A review link's people: Acme Studio's badge, on the comments the server marks `team`. */
const LINK_PEOPLE: CommentPeople = {
  badgeSrc: "/api/s/token/brand/icon?v=0123456789abcdef",
  teamCompany: "Acme Studio",
  isTeam: (comment) => comment.team === true,
};

/** `element` as a review link draws it (`people`), or as the workspace does without. */
function render(element: ReactElement, people: CommentPeople | null): string {
  return renderToStaticMarkup(
    people ? createElement(CommentPeopleContext, { value: people }, element) : element,
  );
}

function card(
  comment: Comment,
  viewer: CommentViewer = member,
  people: CommentPeople | null = null,
): string {
  const rights = commentRights(comment, viewer);
  return render(
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
    people,
  );
}

function popover(comment: Comment, people: CommentPeople | null = null): string {
  return render(
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
    people,
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

describe("the author's avatar (4b.15)", () => {
  const PHOTO = "/api/s/token/people/AAAAAAAAAAAAAAAAAAAAAA/avatar?v=0123456789abcdef";
  const TEAM = ", on the Acme Studio team";

  it.each([
    ["comment card", (comment: Comment) => card(comment, member, LINK_PEOPLE)],
    ["pin popover", (comment: Comment) => popover(comment, LINK_PEOPLE)],
  ])(
    "on a review link's %s, shows a team member's photo with the badge, and says so in words",
    (_name, draw) => {
      const html = draw({ ...COMMENT, team: true, authorAvatar: PHOTO });
      expect(html).toContain('data-testid="comment-avatar"');
      expect(html).toContain(`src="${PHOTO}"`);
      expect(html).toContain('data-testid="company-badge"');
      expect(html).toContain(`src="${LINK_PEOPLE.badgeSrc}"`);
      expect(html).toContain(`<span class="sr-only">${TEAM}</span>`);
      // Without a photo: initials, still with the badge.
      const initials = draw({ ...COMMENT, team: true });
      expect(initials).toContain('data-testid="comment-initials"');
      expect(initials).toContain('data-testid="company-badge"');
    },
  );

  it.each([
    ["comment card", (comment: Comment) => card(comment, member, LINK_PEOPLE)],
    ["pin popover", (comment: Comment) => popover(comment, LINK_PEOPLE)],
  ])("on a review link's %s, gives a client's comment initials and nothing else", (_name, draw) => {
    // A photo a client's comment somehow carried is never shown.
    const html = draw({ ...COMMENT, authorAvatar: PHOTO });
    expect(html).toContain('data-testid="comment-initials"');
    expect(html).not.toContain(PHOTO);
    expect(html).not.toContain("company-badge");
    expect(html).not.toContain(TEAM);
  });

  it("in the workspace, says nothing of a team and leaves a client's comment unbadged", () => {
    const team = card({ ...COMMENT, authorAvatar: PHOTO });
    expect(team).toContain(`src="${PHOTO}"`);
    expect(team).not.toContain("on the");
    const client = card({ ...COMMENT, fromClient: true, authorAvatar: PHOTO }, owner);
    expect(client).not.toContain(PHOTO);
    expect(client).toContain('data-testid="comment-initials"');
    expect(client).not.toContain("company-badge");
  });
});
