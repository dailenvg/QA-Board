import { describe, expect, it } from "vitest";
import { LEGACY_V1, LEGACY_V2 } from "@/test/legacy-v1";
import { MIGRATED_PAGE_ID } from "./pages";
import { parseData } from "./persist";

/** The checkout mockup as a version 3 project: one page, still on its version 2 blob. */
const MOCK_PAGES = {
  kind: "pages",
  origin: "image",
  pages: [{ id: MIGRATED_PAGE_ID, blobKey: "image:mock", name: "checkout.png" }],
  fileName: "checkout.png",
};

const snapshot = {
  id: "s1",
  projectId: "site",
  width: 1280,
  height: 4000,
  createdAt: 1_700_000_001_000,
  blobKey: "snapshot:s1",
  sourceUrl: "https://example.com/",
};

const crop = { blobKey: "crop:c3", rect: { x: 0, y: 120, width: 1280, height: 800 } };

const snapshotComment = {
  ...LEGACY_V1.comments[0],
  id: "c3",
  snapshotId: "s1",
  crop,
};

function parse(value: unknown) {
  const result = parseData(JSON.stringify(value));
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe("parseData", () => {
  it("reads version 1 data as version 3, moving inline images out as pending blob writes", () => {
    const result = parse(LEGACY_V1);
    expect(result.repaired).toBe(false);
    expect(result.storedVersion).toBe(1);
    expect(result.data.version).toBe(3);
    expect(result.data.snapshots).toEqual([]);
    expect(result.data.folders).toEqual([{ ...LEGACY_V1.folders[0], parentId: null }]);
    const [onSite, onImage] = LEGACY_V1.comments;
    expect(result.data.comments).toEqual([onSite, { ...onImage, pageId: MIGRATED_PAGE_ID }]);
    expect(result.data.authorName).toBe("Ana");
    const [site, mock] = LEGACY_V1.projects;
    expect(result.data.projects).toEqual([site, { ...mock, source: MOCK_PAGES }]);
    expect(result.pendingImages).toEqual([{ key: "image:mock", dataUrl: mock.source.dataUrl }]);
  });

  it("reads version 2 data as version 3: each image becomes one page on its own blob", () => {
    const result = parse(LEGACY_V2);
    expect(result.repaired).toBe(false);
    expect(result.storedVersion).toBe(2);
    expect(result.pendingImages).toEqual([]);
    expect(result.data.projects[1]?.source).toEqual({
      ...MOCK_PAGES,
      referenceUrl: "https://example.com/checkout",
    });
    // Comments on the image move onto its page; those on a snapshot stay there.
    expect(
      result.data.comments.map(({ id, snapshotId, pageId }) => [id, snapshotId, pageId]),
    ).toEqual([
      ["c1", undefined, undefined],
      ["c2", undefined, MIGRATED_PAGE_ID],
      ["c3", "s1", undefined],
    ]);
    expect(result.data.folders.every((folder) => folder.parentId === null)).toBe(true);
  });

  it("is idempotent: version 3 data reads back exactly as it was saved", () => {
    for (const legacy of [LEGACY_V1, LEGACY_V2]) {
      const first = parse(legacy);
      const again = parse(first.data);
      expect(again.data).toEqual(first.data);
      expect(again.storedVersion).toBe(3);
      expect(again.repaired).toBe(false);
      expect(again.pendingImages).toEqual([]);
    }
  });

  it("refuses page projects without pages, or with a page id twice", () => {
    const data = parse(LEGACY_V2).data;
    const [site, mock] = data.projects;
    if (!site || mock?.source.kind !== "pages") throw new Error("fixture");
    const [page] = mock.source.pages;
    const withPages = (pages: unknown[]) =>
      parseData(
        JSON.stringify({
          ...data,
          projects: [site, { ...mock, source: { ...mock.source, pages } }],
        }),
      );
    expect(withPages([]).ok).toBe(false);
    expect(withPages([page, page]).ok).toBe(false);
    expect(withPages([{ ...page, width: 10 }]).ok).toBe(false);
    expect(withPages([{ ...page, rev: 0 }]).ok).toBe(false);
    expect(withPages([{ ...page, rev: 1.5 }]).ok).toBe(false);
    expect(withPages([{ ...page, rev: 3 }]).ok).toBe(true);
    expect(withPages([{ ...page, id: "other", width: 10, height: 20 }]).ok).toBe(true);
  });

  it("keeps every comment on a surface its project has", () => {
    const data = parse(LEGACY_V2).data;
    const [onSite, onPage, onSnapshot] = data.comments;
    if (!onSite || !onPage || !onSnapshot) throw new Error("fixture");
    const result = parse({
      ...data,
      comments: [
        { ...onSite, pageId: MIGRATED_PAGE_ID },
        { ...onPage, pageId: "gone" },
        { ...onSnapshot, pageId: MIGRATED_PAGE_ID },
      ],
    });
    expect(result.repaired).toBe(true);
    expect(result.data.comments).toEqual([onSite, onPage, onSnapshot]);
  });

  it("moves folders with an unknown parent to the top level and breaks cycles", () => {
    const folder = (id: string, parentId: string | null) => ({
      id,
      name: id,
      createdAt: 1,
      parentId,
    });
    const result = parse({
      ...parse(LEGACY_V2).data,
      folders: [
        folder("default", null),
        folder("a", "b"),
        folder("b", "a"),
        folder("self", "self"),
        folder("lost", "nowhere"),
        folder("child", "default"),
      ],
    });
    expect(result.repaired).toBe(true);
    expect(result.data.folders.map(({ id, parentId }) => [id, parentId])).toEqual([
      ["default", null],
      ["a", "b"],
      ["b", null],
      ["self", null],
      ["lost", null],
      ["child", "default"],
    ]);
  });

  it("doesn't migrate the image of a project that repair drops", () => {
    const result = parse({
      ...LEGACY_V1,
      projects: [
        {
          ...LEGACY_V1.projects[1],
          source: { ...LEGACY_V1.projects[1].source, referenceUrl: "javascript:x" },
        },
      ],
    });
    expect(result.pendingImages).toHaveLength(1);
    const dropped = parse({
      ...LEGACY_V1,
      projects: [
        LEGACY_V1.projects[0],
        { ...LEGACY_V1.projects[0], id: "bad", source: { kind: "url", url: "javascript:x" } },
      ],
    });
    expect(dropped.pendingImages).toEqual([]);
  });

  it("keeps snapshots and each comment's snapshot and crop", () => {
    const result = parse({
      ...LEGACY_V1,
      snapshots: [snapshot],
      comments: [...LEGACY_V1.comments, snapshotComment],
    });
    expect(result.repaired).toBe(false);
    expect(result.data.snapshots).toEqual([snapshot]);
    expect(result.data.comments.at(-1)).toEqual(snapshotComment);
  });

  it("skips unreadable snapshots and those of deleted projects", () => {
    const result = parse({
      ...LEGACY_V1,
      snapshots: [
        snapshot,
        { ...snapshot, id: "s2", width: "wide" },
        { ...snapshot, id: "s3", projectId: "gone" },
      ],
    });
    expect(result.repaired).toBe(true);
    expect(result.data.snapshots.map((entry) => entry.id)).toEqual(["s1"]);
  });

  it("treats a snapshots field that isn't a list as empty", () => {
    const result = parse({ ...LEGACY_V1, snapshots: "nope" });
    expect(result.repaired).toBe(true);
    expect(result.data.snapshots).toEqual([]);
  });

  it("drops an unreadable crop but keeps its comment", () => {
    const result = parse({
      ...LEGACY_V1,
      comments: [{ ...snapshotComment, crop: { blobKey: 7, rect: null } }],
    });
    expect(result.repaired).toBe(true);
    const [comment] = result.data.comments;
    expect(comment?.id).toBe("c3");
    expect(comment).not.toHaveProperty("crop");
  });

  it("still rejects a comment whose snapshot id isn't a string", () => {
    const result = parseData(
      JSON.stringify({ ...LEGACY_V1, comments: [{ ...snapshotComment, snapshotId: 4 }] }),
    );
    expect(result.ok).toBe(false);
  });

  it("keeps a project's share details, and drops unreadable ones", () => {
    const share = { id: "s", token: "t", ownerKey: "k", createdAt: 1, cursor: 4, lastSyncedAt: 9 };
    const [site] = LEGACY_V1.projects;
    expect(parse({ ...LEGACY_V1, projects: [{ ...site, share }] }).data.projects[0]?.share).toEqual(
      share,
    );
    const broken = parse({ ...LEGACY_V1, projects: [{ ...site, share: { id: 3 } }] });
    expect(broken.data.projects[0]).not.toHaveProperty("share");
  });

  it("reads pending revocations leniently", () => {
    const entry = { shareId: "s", ownerKey: "k", projectId: "p", dueAt: 5 };
    expect(parse({ ...LEGACY_V1, revocations: [entry, { shareId: 1 }] }).data.revocations).toEqual([
      entry,
    ]);
    expect(parse(LEGACY_V1).data.revocations).toEqual([]);
  });
});
