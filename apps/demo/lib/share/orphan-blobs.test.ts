import { describe, expect, it, vi } from "vitest";
import { shareIdOf, sweepOrphanBlobs, type BlobLister, type ListedBlob } from "./orphan-blobs";

const NOW = Date.UTC(2026, 9, 27);
const DAY = 86_400_000;
const BEFORE = NOW - 31 * DAY;
const OLD = new Date(BEFORE - 1);

const blob = (pathname: string, uploadedAt = OLD): ListedBlob => ({
  url: `https://store.private.blob.example/${pathname}`,
  pathname,
  uploadedAt,
});

/** A Blob store listed in `pages`, recording what's deleted. */
function lister(pages: ListedBlob[][]) {
  const deleted: string[][] = [];
  const list = vi.fn((cursor?: string) => {
    const index = cursor ? Number(cursor) : 0;
    const hasMore = index + 1 < pages.length;
    return Promise.resolve({
      blobs: pages[index] ?? [],
      hasMore,
      ...(hasMore ? { cursor: String(index + 1) } : {}),
    });
  });
  const del = (urls: string[]) => {
    deleted.push(urls);
    return Promise.resolve();
  };
  const api: BlobLister = { list, del };
  return { api, list, deleted };
}

describe("orphaned Blob files", () => {
  it("knows a share's files by their path, and nothing else", () => {
    expect(shareIdOf("squint/AbC_12-x/snapshot-s1-k3Xr.jpg")).toBe("AbC_12-x");
    expect(shareIdOf("squint/AbC/")).toBe("AbC");
    expect(shareIdOf("squint/file.png")).toBeNull();
    expect(shareIdOf("other/AbC/file.png")).toBeNull();
    expect(shareIdOf("squint/../AbC/file.png")).toBeNull();
  });

  it("deletes only old files of gone shares, across pages, in batches", async () => {
    const gone = Array.from({ length: 150 }, (_, index) => blob(`squint/gone/crop-${index}.png`));
    const { api, list, deleted } = lister([
      [
        blob("squint/live/page-1.png"),
        blob("squint/gone/recent.png", new Date(BEFORE)),
        blob("squint/stray.png"),
        blob("elsewhere/gone/x.png"),
        ...gone,
      ],
      [blob("squint/also-gone/snapshot-1.jpg"), blob("squint/live/crop-1.png")],
    ]);
    const isLive = vi.fn((shareId: string) => Promise.resolve(shareId === "live"));

    const result = await sweepOrphanBlobs(api, BEFORE, isLive, Infinity);

    expect(result).toEqual({ deleted: 151, done: true });
    expect(deleted.map((batch) => batch.length)).toEqual([100, 50, 1]);
    expect(deleted.flat()).toEqual([
      ...gone.map((entry) => entry.url),
      blob("squint/also-gone/snapshot-1.jpg").url,
    ]);
    // Each share is looked up once, however many files it has.
    expect(isLive.mock.calls.map(([id]) => id).sort()).toEqual(["also-gone", "gone", "live"]);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("stops before the next page once the deadline has passed", async () => {
    const { api, list } = lister([[blob("squint/gone/a.png")], [blob("squint/gone/b.png")]]);
    const isLive = () => Promise.resolve(false);
    expect(await sweepOrphanBlobs(api, BEFORE, isLive, Date.now() - 1)).toEqual({
      deleted: 0,
      done: false,
    });
    expect(list).not.toHaveBeenCalled();
  });
});
