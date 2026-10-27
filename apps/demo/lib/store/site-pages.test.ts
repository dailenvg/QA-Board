import { describe, expect, it } from "vitest";
import {
  activeByPage,
  commentsInScope,
  latestSnapshotOf,
  pageOfComment,
  reviewedPages,
} from "./site-pages";
import type { Comment, Snapshot } from "./types";

const HOME = "https://acme.example/";
const PRICING = "https://acme.example/pricing";

const snapshot = (id: string, sourceUrl: string, width = 1440, createdAt = 1): Snapshot => ({
  id,
  projectId: "p",
  width,
  height: 3000,
  createdAt,
  blobKey: `snapshot:${id}`,
  sourceUrl,
});

const comment = (
  id: string,
  snapshotId?: string,
  status: Comment["status"] = "active",
): Comment => ({
  id,
  projectId: "p",
  x: 1,
  y: 1,
  body: "b",
  author: "a",
  status,
  createdAt: 1,
  updatedAt: 1,
  ...(snapshotId ? { snapshotId } : {}),
});

const list = [
  snapshot("home-desktop", HOME),
  snapshot("pricing-desktop", `${PRICING}#plans`),
  snapshot("pricing-mobile", PRICING, 390),
  snapshot("pricing-desktop-2", PRICING, 1440, 2),
];
const byId = new Map(list.map((entry) => [entry.id, entry]));

describe("pageOfComment", () => {
  it("is its snapshot's page, ignoring the fragment it was captured with", () => {
    expect(pageOfComment(comment("c", "pricing-desktop"), byId, HOME)).toBe(PRICING);
    expect(pageOfComment(comment("c", "home-desktop"), byId, HOME)).toBe(HOME);
  });

  it("is the project's own page for live-frame comments and lost snapshots", () => {
    expect(pageOfComment(comment("c"), byId, HOME)).toBe(HOME);
    expect(pageOfComment(comment("c", "gone"), byId, HOME)).toBe(HOME);
  });
});

describe("latestSnapshotOf", () => {
  it("keeps each page's snapshots apart at each breakpoint", () => {
    expect(latestSnapshotOf(list, "desktop", HOME, HOME)?.id).toBe("home-desktop");
    expect(latestSnapshotOf(list, "desktop", PRICING, HOME)?.id).toBe("pricing-desktop-2");
    expect(latestSnapshotOf(list, "mobile", PRICING, HOME)?.id).toBe("pricing-mobile");
    expect(latestSnapshotOf(list, "mobile", HOME, HOME)).toBeNull();
  });
});

describe("activeByPage", () => {
  it("counts active comments on each page at every breakpoint", () => {
    const comments = [
      comment("a", "home-desktop"),
      comment("b", "pricing-desktop"),
      comment("c", "pricing-mobile"),
      comment("d", "pricing-mobile", "resolved"),
      comment("e"),
    ];
    expect(activeByPage(comments, byId, HOME)).toEqual(
      new Map([
        [HOME, 2],
        [PRICING, 2],
      ]),
    );
  });
});

describe("reviewedPages", () => {
  it("puts the project's page first, then the others by path, with the one being viewed", () => {
    const about = "https://acme.example/about";
    expect(reviewedPages(list, HOME, about)).toEqual([HOME, about, PRICING]);
    expect(reviewedPages([], HOME, HOME)).toEqual([HOME]);
  });
});

describe("commentsInScope", () => {
  const comments = [
    comment("home", "home-desktop"),
    comment("pricing", "pricing-desktop"),
    comment("pricing-phone", "pricing-mobile"),
    comment("live"),
  ];
  const ids = (found: Comment[]) => found.map((entry) => entry.id);

  it("lists one page at one breakpoint", () => {
    expect(
      ids(commentsInScope(comments, byId, { breakpoint: "desktop", page: HOME, home: HOME })),
    ).toEqual(["home", "live"]);
    expect(
      ids(commentsInScope(comments, byId, { breakpoint: "mobile", page: PRICING, home: HOME })),
    ).toEqual(["pricing-phone"]);
  });

  it("lists every page at one breakpoint", () => {
    expect(
      ids(commentsInScope(comments, byId, { breakpoint: "desktop", page: null, home: HOME })),
    ).toEqual(["home", "pricing", "live"]);
  });
});
