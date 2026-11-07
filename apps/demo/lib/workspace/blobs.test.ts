import { describe, expect, it } from "vitest";
import { addFolder, NOW, PNG, twoWorkspaces, URL_PROJECT } from "@/test/workspace-fixture";
import type { ClientUploadDriver, UploadedFile } from "./blob-driver";
import { blobPath } from "./blob-paths";
import { deleteBlob, findBlob, storageSummary } from "./blobs";
import { createProject, trashProject } from "./projects";
import { commitUpload, storeInline, uploadGrant } from "./uploads";

/** A Vercel Blob store in memory: `files` by pathname, `discarded` URLs. */
function fakeStore(files: Record<string, UploadedFile> = {}) {
  const discarded: string[] = [];
  const driver: ClientUploadDriver = {
    kind: "vercel",
    read: () => Promise.resolve(PNG),
    discard: (locations) => {
      for (const location of locations)
        if (location.kind === "vercel") discarded.push(location.url);
      return Promise.resolve();
    },
    head: (pathname) => Promise.resolve(files[pathname] ?? null),
    handleUpload: () => Promise.reject(new Error("unused")),
    list: () => Promise.resolve({ files: [], hasMore: false }),
  };
  return { driver, discarded };
}

async function setup() {
  const fixture = await twoWorkspaces();
  await addFolder(fixture.db, fixture.a.workspaceId);
  await createProject(fixture.db, fixture.a.workspaceId, URL_PROJECT("p1"), NOW);
  return fixture;
}

describe("inline files", () => {
  it("stores a sniffed image once, counts it, serves it, and deletes it", async () => {
    const { db, a } = await setup();
    const target = { projectId: "p1", key: "snapshot:s1" };
    expect(await storeInline(db, a.workspaceId, target, PNG)).toEqual({
      ok: true,
      value: { key: "snapshot:s1", created: true },
    });
    // Never overwritten: the second store is a no-op.
    expect(await storeInline(db, a.workspaceId, target, new Uint8Array([...PNG, 1]))).toEqual({
      ok: true,
      value: { key: "snapshot:s1", created: false },
    });
    expect(await storageSummary(db, a.workspaceId)).toMatchObject({
      bytes: PNG.length,
      blobCount: 1,
    });
    const found = await findBlob(db, a.workspaceId, "p1", "snapshot:s1");
    expect(found).toMatchObject({
      path: blobPath(a.workspaceId, "p1", "snapshot:s1"),
      contentType: "image/png",
      size: PNG.length,
      location: { kind: "inline", bytes: PNG },
    });
    expect(await deleteBlob(db, a.workspaceId, "p1", "snapshot:s1")).toEqual({
      kind: "inline",
      bytes: PNG,
    });
    expect(await storageSummary(db, a.workspaceId)).toMatchObject({ bytes: 0, blobCount: 0 });
  });

  it("refuses what isn't an image, an empty file, and a full quota", async () => {
    const { db, a } = await setup();
    const target = { projectId: "p1", key: "crop:c1" };
    expect(await storeInline(db, a.workspaceId, target, new Uint8Array([1, 2, 3]))).toEqual({
      ok: false,
      reason: "wrong-kind",
    });
    expect(await storeInline(db, a.workspaceId, target, new Uint8Array())).toEqual({
      ok: false,
      reason: "too-large",
    });
    await db.query("UPDATE workspaces SET storage_quota_bytes = 4 WHERE id = $1", [a.workspaceId]);
    expect(await storeInline(db, a.workspaceId, target, PNG)).toEqual({
      ok: false,
      reason: "quota",
    });
  });

  it("refuses a trashed project's files", async () => {
    const { db, a } = await setup();
    await storeInline(db, a.workspaceId, { projectId: "p1", key: "crop:c1" }, PNG);
    await trashProject(db, a.workspaceId, "p1", NOW);
    expect(await findBlob(db, a.workspaceId, "p1", "crop:c1")).toBeNull();
    expect(await storeInline(db, a.workspaceId, { projectId: "p1", key: "crop:c2" }, PNG)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});

describe("client uploads", () => {
  const upload = {
    projectId: "p1",
    key: "page:page-1",
    size: 1000,
    contentType: "image/png" as const,
  };

  it("grants a token for the key's fixed path, the declared size and type, for 10 minutes", async () => {
    const { db, a } = await setup();
    const grant = await uploadGrant(db, a.workspaceId, upload, NOW);
    expect(grant).toEqual({
      ok: true,
      value: {
        pathname: `ws/${a.workspaceId}/project/p1/page/page-1`,
        contentType: "image/png",
        maximumSizeInBytes: 1000,
        validUntil: NOW + 10 * 60 * 1000,
        tokenPayload: JSON.stringify({
          workspaceId: a.workspaceId,
          projectId: "p1",
          key: "page:page-1",
        }),
      },
    });
  });

  it("refuses a token over the quota, over the kind's limit, or for a stored file", async () => {
    const { db, a } = await setup();
    await db.query("UPDATE workspaces SET storage_quota_bytes = 999 WHERE id = $1", [
      a.workspaceId,
    ]);
    expect(await uploadGrant(db, a.workspaceId, upload, NOW)).toEqual({
      ok: false,
      reason: "quota",
    });
    expect(
      await uploadGrant(
        db,
        a.workspaceId,
        { ...upload, key: "crop:c1", size: 3 * 1024 * 1024 },
        NOW,
      ),
    ).toEqual({ ok: false, reason: "too-large" });
    await storeInline(db, a.workspaceId, { projectId: "p1", key: "page:page-1" }, PNG);
    expect(await uploadGrant(db, a.workspaceId, { ...upload, size: 10 }, NOW)).toEqual({
      ok: false,
      reason: "exists",
    });
    expect(await uploadGrant(db, a.workspaceId, { ...upload, projectId: "nope" }, NOW)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("commits an uploaded file once, after checking it's really there", async () => {
    const { db, a } = await setup();
    const path = blobPath(a.workspaceId, "p1", "page:page-1");
    const { driver } = fakeStore({
      [path]: { url: "https://store.test/x", size: 500, contentType: "image/png" },
    });
    const target = { projectId: "p1", key: "page:page-1" };
    expect(await commitUpload(db, driver, a.workspaceId, { ...target, key: "page:other" })).toEqual(
      {
        ok: false,
        reason: "not-uploaded",
      },
    );
    expect(await commitUpload(db, driver, a.workspaceId, target)).toEqual({
      ok: true,
      value: { key: "page:page-1", created: true },
    });
    // The callback arriving second (or a retry) changes nothing.
    expect(await commitUpload(db, driver, a.workspaceId, target)).toEqual({
      ok: true,
      value: { key: "page:page-1", created: false },
    });
    expect(await storageSummary(db, a.workspaceId)).toMatchObject({ bytes: 500, blobCount: 1 });
    expect(await findBlob(db, a.workspaceId, "p1", "page:page-1")).toMatchObject({
      location: { kind: "vercel", url: "https://store.test/x" },
    });
  });

  it("deletes an upload that's too big, of the wrong type, or over the quota", async () => {
    const { db, a } = await setup();
    const at = (key: string) => blobPath(a.workspaceId, "p1", key);
    const { driver, discarded } = fakeStore({
      [at("crop:big")]: {
        url: "https://store.test/big",
        size: 3 * 1024 * 1024,
        contentType: "image/png",
      },
      [at("crop:svg")]: { url: "https://store.test/svg", size: 10, contentType: "image/svg+xml" },
      [at("crop:fat")]: { url: "https://store.test/fat", size: 100, contentType: "image/png" },
    });
    const commit = (key: string) =>
      commitUpload(db, driver, a.workspaceId, { projectId: "p1", key });
    expect(await commit("crop:big")).toEqual({ ok: false, reason: "too-large" });
    expect(await commit("crop:svg")).toEqual({ ok: false, reason: "wrong-kind" });
    await db.query("UPDATE workspaces SET storage_quota_bytes = 50 WHERE id = $1", [a.workspaceId]);
    expect(await commit("crop:fat")).toEqual({ ok: false, reason: "quota" });
    expect(discarded).toEqual([
      "https://store.test/big",
      "https://store.test/svg",
      "https://store.test/fat",
    ]);
  });
});
