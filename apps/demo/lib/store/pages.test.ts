import { describe, expect, it } from "vitest";
import { LEGACY_V2 } from "@/test/legacy-v1";
import { findPage, MIGRATED_PAGE_ID, placeComment } from "./pages";
import { parseData } from "./persist";
import { reduce } from "./reducer";
import { pageCounts, previewKeyOf, summarize } from "./selectors";
import { referencedBlobKeys } from "./snapshots";
import type { Comment, Project, SquintData } from "./types";

function migrated(): SquintData {
  const result = parseData(JSON.stringify(LEGACY_V2));
  if (!result.ok) throw new Error(result.reason);
  return result.data;
}

const deck: Project = {
  id: "deck",
  folderId: "default",
  name: "Deck",
  source: {
    kind: "pages",
    origin: "pdf",
    pages: [
      { id: "a", blobKey: "page:a", name: "Page 1", width: 1600, height: 900 },
      { id: "b", blobKey: "page:b", name: "Page 2", width: 1600, height: 900 },
    ],
    fileName: "deck.pdf",
  },
  createdAt: 1,
  updatedAt: 1,
};

const note = (id: string, extra: Partial<Comment> = {}): Comment => ({
  id,
  projectId: "deck",
  x: 10,
  y: 10,
  body: "Note",
  author: "Ana",
  status: "active",
  createdAt: 5,
  updatedAt: 5,
  ...extra,
});

function withDeck(): SquintData {
  return reduce(migrated(), { type: "project/create", project: deck });
}

describe("pages", () => {
  it("finds a page and its number", () => {
    expect(findPage(deck, "b")).toMatchObject({ number: 2, page: { id: "b" } });
    expect(findPage(deck, "nope")).toBeNull();
    expect(findPage(deck, undefined)).toBeNull();
  });

  it("keeps each comment on a surface its project has", () => {
    const onPage = note("c", { pageId: "b" });
    expect(placeComment(onPage, deck)).toBe(onPage);
    expect(placeComment(note("c"), deck)).toEqual({ ...note("c"), pageId: "a" });
    expect(placeComment(note("c", { pageId: "gone" }), deck)).toEqual({
      ...note("c"),
      pageId: "a",
    });
    expect(placeComment(note("c", { snapshotId: "s", pageId: "a" }), deck)).toEqual(
      note("c", { snapshotId: "s" }),
    );
    const site = migrated().projects[0];
    if (!site) throw new Error("fixture");
    expect(placeComment(note("c", { pageId: "a" }), site)).toEqual(note("c"));
  });
});

describe("pages in the reducer", () => {
  it("creates page projects only with pages", () => {
    const empty: Project = {
      ...deck,
      id: "empty",
      source: { kind: "pages", origin: "pdf", pages: [], fileName: "empty.pdf" },
    };
    const data = withDeck();
    expect(reduce(data, { type: "project/create", project: empty })).toBe(data);
  });

  it("adds, restores and merges comments onto a page the project has", () => {
    const shared: Project = {
      ...deck,
      share: { id: "s", token: "t", ownerKey: "k", createdAt: 1, cursor: 0 },
    };
    let data = reduce(migrated(), { type: "project/create", project: shared });
    data = reduce(data, { type: "comment/add", comment: note("added", { pageId: "b" }) });
    data = reduce(data, { type: "comment/restore", comment: note("restored", { pageId: "x" }) });
    data = reduce(data, {
      type: "share/merge",
      id: "deck",
      comments: [note("pulled", { pageId: "removed-since" })],
      snapshots: [],
      cursor: 3,
      at: 9,
    });
    const placed = data.comments
      .filter((comment) => comment.projectId === "deck")
      .map((comment) => [comment.id, comment.pageId]);
    expect(placed).toEqual([
      ["added", "b"],
      ["restored", "a"],
      ["pulled", "a"],
    ]);
  });

  it("moves a website's frame pins onto its first page when a screenshot replaces it", () => {
    let data = migrated();
    const before = data.comments.find((comment) => comment.id === "c1");
    expect(before?.pageId).toBeUndefined();
    data = reduce(data, {
      type: "project/replace-source",
      id: "site",
      source: {
        kind: "pages",
        origin: "image",
        pages: [{ id: "shot", blobKey: "page:shot", name: "shot.png", width: 10, height: 10 }],
        fileName: "shot.png",
        referenceUrl: "https://example.com/",
      },
      at: 50,
    });
    expect(data.comments.find((comment) => comment.id === "c1")?.pageId).toBe("shot");
    expect(data.projects.find((project) => project.id === "site")?.updatedAt).toBe(50);
  });

  it("creates folders at the top level or inside a folder that exists", () => {
    const data = migrated();
    const child = { id: "child", name: "Child", createdAt: 2, parentId: "default" };
    expect(reduce(data, { type: "folder/create", folder: child }).folders).toHaveLength(2);
    const orphan = { ...child, parentId: "nowhere" };
    expect(reduce(data, { type: "folder/create", folder: orphan })).toBe(data);
  });
});

describe("pages in selectors", () => {
  it("counts comments per page, every page included", () => {
    let data = withDeck();
    data = reduce(data, { type: "comment/add", comment: note("1", { pageId: "b" }) });
    data = reduce(data, { type: "comment/add", comment: note("2", { pageId: "b" }) });
    data = reduce(data, {
      type: "comment/set-status",
      id: "2",
      status: "resolved",
      at: 6,
    });
    expect(pageCounts(data, deck)).toEqual(
      new Map([
        ["a", { active: 0, resolved: 0 }],
        ["b", { active: 1, resolved: 1 }],
      ]),
    );
    expect(summarize(data, deck)).toMatchObject({
      counts: { active: 1, resolved: 1 },
      status: "comments",
      previewKey: "page:a",
    });
  });

  it("previews a migrated image by its version 2 blob, and keeps every page's blob", () => {
    const data = withDeck();
    const mock = data.projects.find((project) => project.id === "mock");
    if (!mock) throw new Error("fixture");
    expect(previewKeyOf(data, mock)).toBe("image:mock");
    expect(mock.source.kind === "pages" && mock.source.pages[0]?.id).toBe(MIGRATED_PAGE_ID);
    const keys = referencedBlobKeys(data);
    for (const key of ["image:mock", "page:a", "page:b", "snapshot:s1"]) {
      expect(keys.has(key)).toBe(true);
    }
  });
});
