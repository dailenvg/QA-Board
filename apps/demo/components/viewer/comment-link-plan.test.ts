import { describe, expect, it } from "vitest";
import type { Comment } from "@/lib/store/types";
import { planCommentLink, type LinkedView } from "./comment-link-plan";

function comment(id: string, extra: Partial<Comment> = {}): Comment {
  return {
    id,
    projectId: "p1",
    x: 10,
    y: 20,
    body: "Words",
    author: "Ana",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
    pageId: "page-1",
    ...extra,
  };
}

const ACTIVE = comment("active");
const RESOLVED = comment("resolved", { status: "resolved", resolvedAt: 2 });
const MUST = comment("must", { priority: "must" });
const PAGE_TWO = comment("page-two", { pageId: "page-2" });
const COMMENTS = [ACTIVE, RESOLVED, MUST, PAGE_TWO];

/** The view a link usually opens on: Active, every priority, no draft, all in scope. */
const VIEW: LinkedView = {
  tab: "active",
  filter: "all",
  draftSurfaceKey: null,
  scoped: COMMENTS,
};

const NOTHING_TO_WIDEN = {
  found: true,
  tab: null,
  showAllPriorities: false,
  showAllScope: false,
  keepStage: false,
};

describe("planCommentLink", () => {
  it("finds a comment already shown and widens nothing", () => {
    expect(planCommentLink("active", COMMENTS, VIEW)).toEqual({
      ...NOTHING_TO_WIDEN,
      id: "active",
    });
  });

  it("says not found for an id that isn't among the comments this viewer sees", () => {
    expect(planCommentLink("deleted", COMMENTS, VIEW)).toEqual({ found: false });
    expect(planCommentLink("active", [], VIEW)).toEqual({ found: false });
  });

  it("switches to Resolved only for a resolved comment on the Active tab", () => {
    expect(planCommentLink("resolved", COMMENTS, VIEW)).toMatchObject({ tab: "resolved" });
    expect(planCommentLink("resolved", COMMENTS, { ...VIEW, tab: "resolved" })).toMatchObject({
      tab: null,
    });
  });

  it("switches back to Active for an active comment on the Resolved tab", () => {
    expect(planCommentLink("active", COMMENTS, { ...VIEW, tab: "resolved" })).toMatchObject({
      tab: "active",
    });
  });

  it("shows every priority only when the filter hides the comment", () => {
    expect(planCommentLink("active", COMMENTS, { ...VIEW, filter: "must" })).toMatchObject({
      showAllPriorities: true,
    });
    expect(planCommentLink("must", COMMENTS, { ...VIEW, filter: "must" })).toMatchObject({
      showAllPriorities: false,
    });
    expect(planCommentLink("active", COMMENTS, { ...VIEW, filter: "none" })).toMatchObject({
      showAllPriorities: false,
    });
  });

  it("brings another page's comment onto the stage, leaving the scope to follow it", () => {
    const view = { ...VIEW, scoped: [ACTIVE] };
    expect(planCommentLink("page-two", COMMENTS, view)).toEqual({
      ...NOTHING_TO_WIDEN,
      id: "page-two",
    });
  });

  it("keeps a restored draft's stage, widening the scope when it hides the comment", () => {
    const view = { ...VIEW, draftSurfaceKey: "page:page-1", scoped: [ACTIVE, RESOLVED, MUST] };
    expect(planCommentLink("page-two", COMMENTS, view)).toMatchObject({
      keepStage: true,
      showAllScope: true,
    });
    expect(planCommentLink("page-two", COMMENTS, { ...view, scoped: COMMENTS })).toMatchObject({
      keepStage: true,
      showAllScope: false,
    });
  });

  it("opens as usual when the comment is on the draft's own surface", () => {
    const view = { ...VIEW, draftSurfaceKey: "page:page-1" };
    expect(planCommentLink("active", COMMENTS, view)).toMatchObject({ keepStage: false });
  });

  it("widens several things at once when several hide it", () => {
    const resolvedMust = comment("both", { status: "resolved", priority: "must" });
    expect(planCommentLink("both", [resolvedMust], { ...VIEW, filter: "nit", scoped: [] })).toEqual(
      {
        found: true,
        id: "both",
        tab: "resolved",
        showAllPriorities: true,
        showAllScope: false,
        keepStage: false,
      },
    );
  });
});
