import { describe, expect, it } from "vitest";
import { bucketOf } from "./storage-buckets";

describe("bucketOf", () => {
  it("files a project's pages by what the project was made from", () => {
    expect(bucketOf({ kind: "page", video: false, origin: "pdf" })).toBe("pdfs");
    expect(bucketOf({ kind: "page", video: false, origin: "image" })).toBe("images");
    // A page whose project is gone (waiting for cleanup) still counts as a picture.
    expect(bucketOf({ kind: "page", video: false, origin: null })).toBe("images");
    // Pictures from before pages, of either kind of project.
    expect(bucketOf({ kind: "image", video: false, origin: "pdf" })).toBe("pdfs");
    expect(bucketOf({ kind: "image", video: false, origin: null })).toBe("images");
  });

  it("files snapshots and crops by kind, whatever the project", () => {
    expect(bucketOf({ kind: "snapshot", video: false, origin: null })).toBe("snapshots");
    expect(bucketOf({ kind: "crop", video: false, origin: "pdf" })).toBe("crops");
  });

  it("files any video as a video, and everything else (a logo) as other", () => {
    expect(bucketOf({ kind: "page", video: true, origin: "image" })).toBe("videos");
    expect(bucketOf({ kind: null, video: true, origin: null })).toBe("videos");
    expect(bucketOf({ kind: null, video: false, origin: null })).toBe("other");
    expect(bucketOf({ kind: "brand", video: false, origin: null })).toBe("other");
  });
});
