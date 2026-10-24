import { describe, expect, it } from "vitest";
import { LEGACY_V1 } from "@/test/legacy-v1";
import { parseData } from "./persist";

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
  it("loads data saved before snapshots existed, unchanged and unrepaired", () => {
    const result = parse(LEGACY_V1);
    expect(result.repaired).toBe(false);
    expect(result.data.snapshots).toEqual([]);
    expect(result.data.projects).toEqual(LEGACY_V1.projects);
    expect(result.data.comments).toEqual(LEGACY_V1.comments);
    expect(result.data.authorName).toBe("Ana");
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
});
