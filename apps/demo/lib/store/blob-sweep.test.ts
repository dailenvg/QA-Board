import { describe, expect, it } from "vitest";
import { BLOB_GRACE_MS, staleBlobKeys } from "./blob-sweep";

describe("staleBlobKeys", () => {
  const now = 10 * BLOB_GRACE_MS;

  it("deletes only unreferenced blobs older than the grace period", () => {
    const entries = [
      { key: "snapshot:kept", createdAt: 0 },
      { key: "crop:orphan", createdAt: 0 },
      { key: "crop:just-saved", createdAt: now - 1000 },
      { key: "crop:exactly-grace", createdAt: now - BLOB_GRACE_MS },
    ];
    expect(staleBlobKeys(entries, new Set(["snapshot:kept"]), now)).toEqual([
      "crop:orphan",
      "crop:exactly-grace",
    ]);
  });
});
