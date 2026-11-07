import { describe, expect, it } from "vitest";
import { addFolder, NOW, PAGES_PROJECT, twoWorkspaces } from "@/test/workspace-fixture";
import { addComment, listComments } from "./comments";
import { pagesByProject, replacePages } from "./pages";
import { createProject } from "./projects";

describe("pages", () => {
  it("reorders, renames, adds and deletes pages in one transaction", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    await createProject(db, a.workspaceId, PAGES_PROJECT("p1"), NOW);
    const comment = { id: "c1", x: 1, y: 2, body: "Hi", author: "Ana", status: "active" as const };
    await addComment(db, a.workspaceId, "p1", { ...comment, pageId: "page-1" }, null, NOW);

    await db.transaction((tx) =>
      replacePages(tx, a.workspaceId, "p1", [
        { id: "page-2", blobKey: "page:page-2", name: "About us", rev: 2 },
        { id: "page-3", blobKey: "page:page-3", name: "Contact" },
      ]),
    );
    const pages = await pagesByProject(db, a.workspaceId, ["p1"]);
    expect(pages.get("p1")).toEqual([
      { id: "page-2", blobKey: "page:page-2", name: "About us", rev: 2 },
      { id: "page-3", blobKey: "page:page-3", name: "Contact" },
    ]);
    // The deleted page took its comment with it, as in the browser.
    expect(await listComments(db, a.workspaceId, "p1")).toEqual([]);
  });

  it("never touches another workspace's project", async () => {
    const { db, a, b } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    await createProject(db, a.workspaceId, PAGES_PROJECT("p1"), NOW);
    await db.transaction((tx) =>
      replacePages(tx, b.workspaceId, "p1", [{ id: "evil", blobKey: "page:evil", name: "Evil" }]),
    );
    expect(await pagesByProject(db, b.workspaceId, ["p1"])).toEqual(new Map());
    expect(
      (await pagesByProject(db, a.workspaceId, ["p1"])).get("p1")?.map((page) => page.id),
    ).toEqual(["page-1", "page-2"]);
  });
});
