import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AVATAR_FILL } from "@/lib/avatar/default-avatar";
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

const LOGO_BADGE = "/api/s/token/brand/icon?v=0123456789abcdef";

/** A review link's people: Acme Studio's badge, on the comments the server marks `team`. */
const LINK_PEOPLE: CommentPeople = {
  badge: { logoSrc: LOGO_BADGE },
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
      breakpoint: null,
      cropPin: null,
      canModerate: viewer.team,
      canEdit: rights.edit,
      canDelete: rights.delete !== null,
      resolvedNote: rights.resolvedNote,
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

describe("a review link's guest (4.12)", () => {
  const guest: CommentViewer = { team: false, moderator: false };
  const OWN: Comment = { ...COMMENT, mine: true };
  const NOTE = "The team resolved this, so it can&#x27;t be edited.";

  it("gets Edit on their own active comment, and nothing else", () => {
    const html = card(OWN, guest);
    expect(html).toContain(EDIT);
    expect(html).toContain("data-edit-trigger");
    expect(html).not.toContain(DELETE);
    expect(html).not.toContain("Resolve");
  });

  it("gets no actions on anyone else's, or once the review window has closed", () => {
    expect(card(COMMENT, guest)).not.toContain(EDIT);
    expect(card({ ...COMMENT, team: true }, guest)).not.toContain(EDIT);
    expect(card(OWN, { ...guest, reviewOpen: false })).not.toContain(EDIT);
    expect(card(OWN, { ...guest, reviewOpen: false })).not.toContain(NOTE);
  });

  it("is told why their own resolved comment can't be edited, read after its text", () => {
    const html = card({ ...OWN, status: "resolved" }, guest);
    expect(html).not.toContain(EDIT);
    expect(html).toContain(NOTE);
    const note = /<p id="([^"]+)" data-testid="comment-resolved-note"/.exec(html)?.[1];
    expect(note).toBeTruthy();
    expect(html).toMatch(new RegExp(`aria-describedby="[^"]*${note}`));
    // Not on a resolved comment that isn't theirs.
    expect(card({ ...COMMENT, status: "resolved" }, guest)).not.toContain(NOTE);
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
      expect(html).toContain(`src="${LOGO_BADGE}"`);
      expect(html).toContain(`<span class="sr-only">${TEAM}</span>`);
      // Without a photo: the default mark, head and shoulders, beside the badge.
      const badged = draw({ ...COMMENT, team: true });
      expect(badged).toMatch(/<svg[^>]*data-testid="comment-initials"[^>]*data-mark="person"/);
      expect(badged).toContain('data-testid="company-badge"');
      expect(badged).not.toContain("<text");
    },
  );

  it("draws the company's default gray badge when it has no logo", () => {
    const people = { ...LINK_PEOPLE, badge: { logoSrc: null } };
    const html = card({ ...COMMENT, team: true }, member, people);
    expect(html).toMatch(/<svg[^>]*data-testid="company-badge"[^>]*data-mark="company"/);
    expect(html).toContain(`fill="${AVATAR_FILL}"`);
    expect(html).not.toContain(LOGO_BADGE);
  });

  it.each([
    ["comment card", (comment: Comment) => card(comment, member, LINK_PEOPLE)],
    ["pin popover", (comment: Comment) => popover(comment, LINK_PEOPLE)],
  ])(
    "on a review link's %s, gives a client's comment the person mark and nothing else",
    (_name, draw) => {
      // A photo a client's comment somehow carried is never shown.
      const html = draw({ ...COMMENT, authorAvatar: PHOTO });
      expect(html).toMatch(/<svg[^>]*data-testid="comment-initials"[^>]*data-mark="person"/);
      expect(html).not.toContain("<text");
      expect(html).not.toContain(PHOTO);
      expect(html).not.toContain("company-badge");
      expect(html).not.toContain(TEAM);
    },
  );

  it("without a badge to show, gives a team member the person mark, never initials", () => {
    // In the workspace, outside a signed-in session: no company, so no badge.
    const html = card({ ...COMMENT });
    expect(html).toMatch(/<svg[^>]*data-testid="comment-initials"[^>]*data-mark="person"/);
    expect(html).not.toContain("<text");
    expect(html).not.toContain("company-badge");
  });

  it("in the workspace, says nothing of a team and leaves a client's comment unbadged", () => {
    const team = card({ ...COMMENT, authorAvatar: PHOTO });
    expect(team).toContain(`src="${PHOTO}"`);
    expect(team).not.toContain("on the");
    const client = card({ ...COMMENT, fromClient: true, authorAvatar: PHOTO }, owner);
    expect(client).not.toContain(PHOTO);
    expect(client).toMatch(/<svg[^>]*data-testid="comment-initials"[^>]*data-mark="person"/);
    expect(client).not.toContain("company-badge");
  });
});
