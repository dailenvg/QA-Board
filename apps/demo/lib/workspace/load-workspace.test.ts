import { describe, expect, it } from "vitest";
import {
  addFolder,
  NOW,
  PAGES_PROJECT,
  PNG,
  twoWorkspaces,
  URL_PROJECT,
} from "@/test/workspace-fixture";
import { findMembership } from "../auth/memberships";
import { addComment } from "./comments";
import { authorName, loadWorkspace, setAuthorName } from "./load-workspace";
import { createProject, trashProject } from "./projects";
import { addSnapshot } from "./snapshots";
import { storeInline } from "./uploads";

describe("loadWorkspace", () => {
  it("reads the whole workspace, without trashed projects or anything of another workspace", async () => {
    const { db, a, b } = await twoWorkspaces();
    for (const seat of [a, b]) await addFolder(db, seat.workspaceId);
    await createProject(db, a.workspaceId, PAGES_PROJECT("deck"), NOW);
    await createProject(db, a.workspaceId, URL_PROJECT("web"), NOW);
    await createProject(db, a.workspaceId, URL_PROJECT("old"), NOW);
    await createProject(db, b.workspaceId, URL_PROJECT("theirs"), NOW);
    await addSnapshot(db, a.workspaceId, "web", {
      id: "s1",
      width: 1,
      height: 1,
      createdAt: NOW,
      blobKey: "snapshot:s1",
      sourceUrl: "https://acme.example/",
    });
    await addComment(
      db,
      a.workspaceId,
      "deck",
      { id: "c1", x: 1, y: 1, body: "Hi", author: "Ana", status: "active", pageId: "page-2" },
      a.userId,
      NOW,
    );
    await addComment(
      db,
      a.workspaceId,
      "old",
      { id: "c2", x: 1, y: 1, body: "Gone", author: "Ana", status: "active" },
      a.userId,
      NOW,
    );
    await storeInline(db, a.workspaceId, { projectId: "web", key: "snapshot:s1" }, PNG);
    await trashProject(db, a.workspaceId, "old", NOW);
    await setAuthorName(db, a.userId, "Ana");

    const membership = await findMembership(db, a.userId, a.workspaceId);
    if (!membership) throw new Error("no membership");
    const data = await loadWorkspace(db, membership, a.userId);
    expect(data.workspace).toEqual({ id: a.workspaceId, slug: "acme", name: "acme" });
    expect(data.folders.map((folder) => folder.id)).toEqual(["f1"]);
    expect(data.projects.map((project) => project.id).sort()).toEqual(["deck", "web"]);
    expect(data.snapshots.map((snapshot) => snapshot.id)).toEqual(["s1"]);
    expect(data.comments.map((comment) => comment.id)).toEqual(["c1"]);
    expect(data.clientActivity).toEqual([]);
    expect(data.storage).toEqual({ bytes: PNG.length, blobCount: 1, quotaBytes: 5 * 1024 ** 3 });
    expect(data.authorName).toBe("Ana");
    // Storage paths and user ids stay on the server.
    const wire = JSON.stringify(data);
    expect(wire).not.toContain("ws/");
    expect(wire).not.toContain(a.userId);
    expect(await authorName(db, b.userId)).toBeNull();
  });
});
