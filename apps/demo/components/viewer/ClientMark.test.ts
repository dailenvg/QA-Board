import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Comment } from "@/lib/store/types";
import { CommentCard } from "./CommentCard";
import { PinPopover } from "./PinPopover";

const TEAM: Comment = {
  id: "c-1",
  projectId: "p-1",
  x: 10,
  y: 20,
  body: "Tighten the hero.",
  author: "Cleo",
  status: "active",
  createdAt: 1_000,
  updatedAt: 1_000,
};
const CLIENT: Comment = { ...TEAM, fromClient: true };

const noop = () => {};
const CHIP = 'data-testid="client-chip"';

function card(comment: Comment, owner: boolean): string {
  return renderToStaticMarkup(
    createElement(CommentCard, {
      comment,
      number: 1,
      placement: null,
      pageNumber: null,
      canModerate: owner,
      selected: false,
      now: 2_000,
      onSelect: noop,
      onEdit: noop,
      onResolve: noop,
      onReopen: noop,
      onDelete: noop,
    }),
  );
}

function popover(comment: Comment, owner: boolean): string {
  return renderToStaticMarkup(
    createElement(PinPopover, {
      id: "popover",
      comment,
      number: 1,
      placement: null,
      now: 2_000,
      canModerate: owner,
      onResolve: noop,
      onReopen: noop,
      onClose: noop,
    }),
  );
}

describe.each([
  ["comment card", card],
  ["pin popover", popover],
])("the Client chip on a %s", (_name, render) => {
  it("marks a client's comment in the workspace's viewer", () => {
    const html = render(CLIENT, true);
    expect(html).toContain(CHIP);
    expect(html).toMatch(/>Client<\/span>/);
  });

  it("never shows on the review link, even on a client's comment", () => {
    expect(render(CLIENT, false)).not.toContain(CHIP);
  });

  it("leaves the team's own comments unmarked", () => {
    expect(render(TEAM, true)).not.toContain(CHIP);
  });
});
