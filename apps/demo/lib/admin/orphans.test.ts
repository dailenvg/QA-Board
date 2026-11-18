import { describe, expect, it, vi } from "vitest";
import { twoWorkspaces } from "@/test/workspace-fixture";
import { inlineBackend, type BlobBackend } from "../share/blob-backend";
import { createPostgresStore } from "../share/postgres-store";
import type { ClientUploadDriver } from "../workspace/blob-driver";
import { brandLogoPath } from "../workspace/blob-paths";
import { UNCOMMITTED_BLOB_MS } from "../workspace/limits";
import { checkOrphans, ORPHAN_CHECK_BUDGET_MS } from "./orphans";

/** The real clock: the check's deadline is real time past it. */
const NOW = Date.now();

/** A Vercel Blob store for workspace files, listing one old file no row records. */
function workspaceStore(): ClientUploadDriver {
  return {
    kind: "vercel",
    read: () => Promise.resolve(null),
    discard: () => Promise.reject(new Error("a check never discards")),
    head: () => Promise.resolve(null),
    handleUpload: () => Promise.reject(new Error("unused")),
    list: (prefix) =>
      Promise.resolve({
        files: prefix.startsWith("user/")
          ? []
          : [
              {
                url: "https://store.test/stale",
                pathname: brandLogoPath("00000000-0000-4000-8000-000000000001", "old"),
                uploadedAt: new Date(NOW - UNCOMMITTED_BLOB_MS - 1),
                size: 300,
              },
            ],
        hasMore: false,
      }),
  };
}

describe("checkOrphans", () => {
  it("reports each sweep's count and bytes, within its budget", async () => {
    const { db } = await twoWorkspaces();
    const scan = vi.fn<NonNullable<BlobBackend["scan"]>>(() =>
      Promise.resolve({ files: 2, bytes: 2048, done: true }),
    );
    const sweep = vi.fn<NonNullable<BlobBackend["sweep"]>>();
    const shares = { store: createPostgresStore(db), blobs: { ...inlineBackend, scan, sweep } };

    const report = await checkOrphans(db, { shares, blobs: workspaceStore() }, NOW);

    expect(report).toEqual({
      checkedAt: NOW,
      complete: true,
      shareFiles: { files: 2, bytes: 2048 },
      workspaceRows: { files: 0, bytes: 0 },
      unrecordedFiles: { files: 1, bytes: 300 },
    });
    expect(scan.mock.calls[0]?.[2]).toBe(NOW + ORPHAN_CHECK_BUDGET_MS);
    expect(sweep).not.toHaveBeenCalled();
  });

  it("says it's partial when a listing ran out of time", async () => {
    const { db } = await twoWorkspaces();
    const scan = () => Promise.resolve({ files: 5, bytes: 50, done: false });
    const shares = { store: createPostgresStore(db), blobs: { ...inlineBackend, scan } };
    const report = await checkOrphans(db, { shares, blobs: workspaceStore() }, NOW);
    expect(report).toMatchObject({ complete: false, shareFiles: { files: 5 } });
  });
});
