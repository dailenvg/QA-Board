import { afterEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { JPEG, PNG } from "@/test/share-fixture";
import { connectedWorkspace, type Intercept } from "@/test/workspace-client";
import type { Database } from "../db/database";
import { createProject } from "../workspace/projects";

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

let intercept: Intercept | null = null;

afterEach(() => {
  intercept = null;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const replacement = {
  blob: new Blob([JPEG], { type: "image/jpeg" }),
  fileName: "about-v2.png",
  width: 1000,
  height: 700,
};

/** Project p1 with pages a and b, b's picture uploaded. */
async function loaded() {
  const workspace = await connectedWorkspace(holder, {
    setUp: async (db, workspaceId) => {
      await createProject(
        db,
        workspaceId,
        {
          id: "p1",
          folderId: "f1",
          name: "Mockups",
          source: {
            kind: "pages",
            origin: "image",
            pages: [
              { id: "a", blobKey: "page:a", name: "home.png", width: 800, height: 600 },
              { id: "b", blobKey: "page:b", name: "about.png", width: 800, height: 600 },
            ],
            fileName: "home.png",
          },
        },
        1,
      );
    },
    intercept: () => intercept,
  });
  const { storeWorkspaceBlob } = await import("../workspace-client/blob-upload");
  await storeWorkspaceBlob("p1", "page:b", new Blob([PNG], { type: "image/png" }));
  const page = () => {
    const project = workspace.data().projects[0];
    return project?.source.kind === "pages" ? project.source.pages[1] : undefined;
  };
  /** The project's stored files, by logical key. */
  const files = async () => {
    const { rows } = await workspace.db.query<{ key: string }>(
      "SELECT key FROM workspace_blobs ORDER BY key",
    );
    return rows.map((row) => row.key.split("/").slice(-2).join(":"));
  };
  return { ...workspace, page, files };
}

describe("replacing a page's picture", () => {
  it("uploads it under a new key with its size and next revision, then deletes the old one", async () => {
    const { actions, page, files, store } = await loaded();
    const result = await actions.replaceWithImage("p1", replacement, {
      referenceUrl: undefined,
      pageId: "b",
    });
    expect(result.ok).toBe(true);
    const after = page();
    expect(after).toMatchObject({ name: "about-v2.png", width: 1000, height: 700, rev: 1 });
    expect(after?.blobKey).not.toBe("page:b");
    await vi.waitFor(async () => expect(await files()).toEqual([after?.blobKey]));
    const read = await store.workspaceBlobs()?.get(after?.blobKey ?? "");
    expect(new Uint8Array((await read?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(JPEG);
  });

  it("is all or nothing: when the server refuses the project, the page and its picture stay", async () => {
    const { actions, page, files } = await loaded();
    const before = page();
    intercept = (request) =>
      request.method === "PATCH" ? Promise.resolve(new Response(null, { status: 500 })) : null;
    const result = await actions.replaceWithImage("p1", replacement, {
      referenceUrl: undefined,
      pageId: "b",
    });
    expect(result.ok).toBe(false);
    expect(page()).toEqual(before);
    // The new picture went again, so nothing is left behind.
    await vi.waitFor(async () => expect(await files()).toEqual(["page:b"]));
  });
});
