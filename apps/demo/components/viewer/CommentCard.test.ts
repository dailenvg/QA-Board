import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AVATAR_FILL } from "@/lib/avatar/default-avatar";
import type { Comment, Reply } from "@/lib/store/types";
import { CommentPeopleContext, type CommentPeople } from "./comment-people";
import { commentRights, type CommentViewer } from "./comment-rights";
import { CommentThreadsContext, type CommentThreads } from "./comment-threads";
import { CardReplyBox } from "./CardReplyBox";
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

describe("a comment posted without its screenshot", () => {
  const PENDING = 'data-testid="screenshot-pending"';
  /** The ids the card's select button reads as its description. */
  const describedBy = (html: string) =>
    (
      /data-card-select[^>]*aria-describedby="([^"]*)"/.exec(html)?.[1] ??
      /aria-describedby="([^"]*)"[^>]*data-card-select/.exec(html)?.[1] ??
      ""
    ).split(" ");

  it("shows the mark where the screenshot would be, and the card reads it", () => {
    for (const comment of [
      { ...COMMENT, pageId: "page-1", fromClient: true as const },
      { ...COMMENT, screenshotPending: true as const },
    ]) {
      const html = card(comment);
      expect(html).toContain("Screenshot pending");
      const id = /id="([^"]+)"[^>]*data-testid="screenshot-pending"/.exec(html)?.[1];
      expect(id).toBeTruthy();
      expect(describedBy(html)).toContain(id);
    }
  });

  // One with its screenshot shows the thumbnail instead (`isScreenshotPending`'s tests).
  it("never shows it on the team's own comment, or a client's on the old live page", () => {
    expect(card({ ...COMMENT, pageId: "page-1" })).not.toContain(PENDING);
    expect(card({ ...COMMENT, fromClient: true })).not.toContain(PENDING);
  });
});

describe("the thread (U1)", () => {
  const reply = (id: string, author: string, createdAt: number, extra: Partial<Reply> = {}) =>
    ({
      id,
      projectId: COMMENT.projectId,
      commentId: COMMENT.id,
      body: `Reply ${id}`,
      author,
      createdAt,
      ...extra,
    }) satisfies Reply;
  const REPLIES = [reply("r-1", "Ana", MINUTE * 2), reply("r-2", "Cleo", NOW - 5 * MINUTE)];
  const threads = (replies: readonly Reply[], viewer: CommentViewer = member): CommentThreads => ({
    repliesOf: (id) => (id === COMMENT.id ? replies : []),
    viewer,
    authorName: "Ben",
    draftOf: () => "",
    keepDraft: noop,
    send: () => Promise.resolve({ ok: false, error: "unused" }),
    edit: noop,
    remove: noop,
    getInfo: noop,
    keepsBox: () => false,
  });
  const withThreads = (element: ReactElement, value: CommentThreads | null) =>
    renderToStaticMarkup(createElement(CommentThreadsContext, { value }, element));
  const cardWith = (
    value: CommentThreads | null,
    selected = false,
    threadInPopover = false,
    comment: Comment = COMMENT,
  ) => {
    const rights = commentRights(comment, member);
    return withThreads(
      createElement(CommentCard, {
        comment,
        number: 1,
        placement: null,
        pageNumber: null,
        breakpoint: null,
        cropPin: null,
        canModerate: true,
        canEdit: rights.edit,
        canDelete: rights.delete !== null,
        resolvedNote: false,
        selected,
        threadInPopover,
        now: NOW,
        onSelect: noop,
        onEdit: noop,
        onResolve: noop,
        onReopen: noop,
        onDelete: noop,
      }),
      value,
    );
  };

  it("sums an unselected card's thread in one line the card reads after the comment", () => {
    const html = cardWith(threads(REPLIES));
    expect(html).toContain('data-testid="reply-summary"');
    expect(html).toMatch(/2 replies<\/span>.*Cleo, <time[^>]*>5 minutes ago<\/time>/);
    const id = /<p id="([^"]+)" data-testid="reply-summary"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toMatch(new RegExp(`aria-describedby="[^"]*${id}"`));
    expect(html).not.toContain('data-testid="comment-thread"');
    expect(html).not.toContain('data-testid="reply-composer"');
  });

  it("says one reply in the singular, and shows no line without replies", () => {
    expect(cardWith(threads(REPLIES.slice(0, 1)))).toContain("1 reply<");
    expect(cardWith(threads([]))).not.toContain("reply-summary");
  });

  it("shows a selected card's thread, oldest first, and the reply box instead of the line", () => {
    const html = cardWith(threads(REPLIES), true);
    expect(html).not.toContain("reply-summary");
    expect(html).toContain('aria-label="Replies to comment 1"');
    expect(html.indexOf("Reply r-1")).toBeLessThan(html.indexOf("Reply r-2"));
    expect(html).toContain('placeholder="Reply…"');
    expect(html).toContain("Enter to send · Shift+Enter for a new line");
    expect(html).toContain('aria-label="Actions for reply by Ana"');
  });

  it("leaves the thread and the box to the pin's popover while it's open, with the line instead", () => {
    const html = cardWith(threads(REPLIES), true, true);
    expect(html).toContain('data-testid="reply-summary"');
    expect(html).not.toContain('data-testid="comment-thread"');
    expect(html).not.toContain('data-testid="reply-composer"');
    expect(cardWith(threads([]), true, true)).not.toContain("reply-composer");
  });

  it("shows a Reply button, not an empty box, on a selected card nobody has replied to", () => {
    const html = cardWith(threads([]), true);
    expect(html).not.toContain('data-testid="comment-thread"');
    expect(html).not.toContain('data-testid="reply-composer"');
    expect(html).toMatch(/<button[^>]*data-testid="reply-start"[^>]*>.*Reply<\/button>/);
  });

  it("shows the box, never the button, once there's a thread", () => {
    const html = cardWith(threads(REPLIES), true);
    expect(html).toContain('data-testid="reply-composer"');
    expect(html).not.toContain('data-testid="reply-start"');
  });

  it("opens the Reply button into the box, which takes focus (CardReplyBox)", () => {
    const props = {
      authorName: "Ben",
      initialBody: "",
      onSend: () => Promise.resolve({ ok: true as const, value: null }),
      onDraftChange: noop,
      onOpen: noop,
    };
    const closed = renderToStaticMarkup(createElement(CardReplyBox, { ...props, open: false }));
    expect(closed).toContain('data-testid="reply-start"');
    expect(closed).not.toContain("reply-composer");
    const opened = renderToStaticMarkup(createElement(CardReplyBox, { ...props, open: true }));
    expect(opened).toContain('data-testid="reply-composer"');
    expect(opened).not.toContain("reply-start");
  });

  it("puts back the words typed and not sent, in the card's box and the popover's", () => {
    const value = {
      ...threads([]),
      draftOf: (id: string) => (id === COMMENT.id ? "Half a re" : ""),
    };
    const html = cardWith(value, true);
    // Never hidden behind the Reply button, even with no thread yet.
    expect(html).not.toContain('data-testid="reply-start"');
    expect(html).toMatch(/<textarea[^>]*>Half a re<\/textarea>/);
  });

  it("asks a member with no name yet for one in the box, only once it's open", () => {
    expect(cardWith({ ...threads([]), authorName: null }, true)).not.toContain("Your name");
    expect(cardWith({ ...threads(REPLIES), authorName: null }, true)).toContain("Your name");
  });

  it("shows nothing of a thread where there's none to read", () => {
    for (const selected of [false, true]) {
      const html = cardWith(null, selected);
      expect(html).not.toContain("reply-summary");
      expect(html).not.toContain("reply-composer");
    }
  });

  describe("on a review link, for its guest", () => {
    const guest: CommentViewer = { team: false, moderator: false };
    const TEAM_REPLY = reply("r-4", "Ana", NOW - MINUTE, { team: true });

    it("sums an unselected card's thread in one line, as for the team", () => {
      const html = cardWith(threads([TEAM_REPLY], guest));
      expect(html).toMatch(/1 reply<\/span>.*Ana, <time/);
      expect(html).not.toContain('data-testid="comment-thread"');
    });

    const RESOLVED: Comment = { ...COMMENT, status: "resolved", resolvedAt: NOW - MINUTE };
    const closed: CommentViewer = { ...guest, reviewOpen: false };
    const NOTES = [
      "The team resolved this, so it&#x27;s closed for replies.",
      "The review window has closed, so you can&#x27;t reply.",
    ];
    const popover = (value: CommentThreads, comment: Comment = COMMENT) =>
      withThreads(
        createElement(PinPopover, {
          id: "popover",
          comment,
          number: 1,
          placement: null,
          now: NOW,
          canModerate: false,
          onResolve: noop,
          onReopen: noop,
          onClose: noop,
        }),
        value,
      );

    it("shows a selected card's thread with the reply box, and no reply menu", () => {
      const html = cardWith(threads([TEAM_REPLY, reply("r-5", "Cleo", NOW)], guest), true);
      expect(html).toContain('aria-label="Replies to comment 1"');
      expect(html.indexOf("Reply r-4")).toBeLessThan(html.indexOf("Reply r-5"));
      expect(html).toContain('data-testid="reply-composer"');
      for (const absent of ["reply-more", "client-chip", "reply-closed-note"]) {
        expect(html).not.toContain(`data-testid="${absent}"`);
      }
    });

    it("shows a Reply button under a selected card nobody has replied to", () => {
      const html = cardWith(threads([], guest), true);
      expect(html).toContain('data-testid="reply-start"');
      expect(html).not.toContain("reply-closed-note");
    });

    it("asks a guest with no name yet for one first (D7)", () => {
      const html = cardWith({ ...threads([TEAM_REPLY], guest), authorName: null }, true);
      expect(html).toContain("Your name");
      expect(html.indexOf("Your name")).toBeLessThan(html.indexOf('placeholder="Reply…"'));
    });

    it("says why there's no box under a resolved comment, or once the window has closed", () => {
      const cases: Array<[CommentThreads, Comment, string | undefined]> = [
        [threads([TEAM_REPLY], guest), RESOLVED, NOTES[0]],
        [threads([], guest), RESOLVED, NOTES[0]],
        [threads([TEAM_REPLY], closed), COMMENT, NOTES[1]],
        [threads([TEAM_REPLY], closed), RESOLVED, NOTES[1]],
      ];
      for (const [value, comment, note] of cases) {
        const html = cardWith(value, true, false, comment);
        expect(html).toContain('data-testid="reply-closed-note"');
        expect(html).toContain(note);
        expect(html).not.toContain("reply-composer");
        expect(html).not.toContain("reply-start");
      }
    });

    it("keeps a box with words still in it, so they can be copied, after the window has closed", () => {
      const html = cardWith({ ...threads([TEAM_REPLY], closed), keepsBox: () => true }, true);
      expect(html).toContain('data-testid="reply-composer"');
      expect(html).not.toContain("reply-closed-note");
    });

    it("shows the thread and the box in the pin's popover, and why there's none when resolved", () => {
      const open = popover(threads([TEAM_REPLY], guest));
      expect(open).toContain("Reply r-4");
      expect(open).toContain('data-testid="reply-composer"');
      expect(open).not.toContain('data-testid="reply-more"');
      const resolved = popover(threads([TEAM_REPLY], guest), RESOLVED);
      expect(resolved).not.toContain("reply-composer");
      expect(resolved).toContain(NOTES[0]);
    });
  });

  it("puts the whole thread and the reply box in the pin's popover", () => {
    const html = withThreads(
      createElement(PinPopover, {
        id: "popover",
        comment: COMMENT,
        number: 1,
        placement: null,
        now: NOW,
        canModerate: true,
        onResolve: noop,
        onReopen: noop,
        onClose: noop,
      }),
      threads(REPLIES),
    );
    expect(html).toContain('aria-label="Replies to comment 1"');
    expect(html).toContain("Reply r-2");
    expect(html).toContain('data-testid="reply-composer"');
    expect(html).toContain("max-h-[50dvh]");
  });

  it("marks a client's reply with the Client chip for the team", () => {
    const html = cardWith(threads([reply("r-3", "Dee", NOW, { fromClient: true })]), true);
    expect(html).toContain('data-testid="client-chip"');
  });
});
