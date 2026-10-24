import { describe, expect, it } from "vitest";
import { BLOB_GRACE_MS, heldBlobKeys, holdBlobs, staleBlobKeys } from "./blob-sweep";

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

  it("never sweeps a key that a pending Undo holds, however old", () => {
    const entries = [{ key: "crop:held", createdAt: 0 }];
    expect(staleBlobKeys(entries, new Set(), now, new Set(["crop:held"]))).toEqual([]);
  });
});

describe("holdBlobs", () => {
  it("holds keys until released, counting overlapping holds", () => {
    const releaseA = holdBlobs(["crop:a", "crop:b"]);
    const releaseB = holdBlobs(["crop:b"]);
    expect([...heldBlobKeys()].sort()).toEqual(["crop:a", "crop:b"]);
    releaseA();
    releaseA(); // A second call changes nothing.
    expect([...heldBlobKeys()]).toEqual(["crop:b"]);
    releaseB();
    expect([...heldBlobKeys()]).toEqual([]);
  });
});
