import { expect, test } from "./test";
import type { Comment, SquintData } from "../lib/store/types";
import { folderCard, seedWorkspace } from "./squint-fixtures";
import { WORKSPACE_SEED } from "./workspace-seed";

function comment(
  id: string,
  projectId: string,
  pageId: string,
  status: Comment["status"],
): Comment {
  const at = Date.now();
  return {
    id,
    projectId,
    pageId,
    x: 20,
    y: 20,
    body: `Comment ${id}`,
    author: "Ada",
    status,
    createdAt: at,
    updatedAt: at,
    ...(status === "resolved" ? { resolvedAt: at } : {}),
  };
}

/**
 * The seed with comments in: My projects' Hero shot (open) and, three folders down in Client
 * work, the Spring Campaign Banner (open). Nothing is resolved.
 */
const WITH_COMMENTS: SquintData = {
  ...WORKSPACE_SEED,
  authorName: "Ada",
  comments: [
    comment("c1", "single", "single-1", "active"),
    comment("c2", "nested", "nested-1", "active"),
  ],
};

test("Folders filters by status: matching folders only, each counting its matching projects", async ({
  page,
}) => {
  await seedWorkspace(page, WITH_COMMENTS, "/folders");
  const filter = page.getByRole("radiogroup", { name: "Filter by status" });
  const titles = page.getByTestId("folder-card").locator(".gf-title");
  await expect(titles).toHaveCount(3);
  // The sort stays beside the filter.
  await expect(page.getByTestId("sort-menu")).toBeVisible();

  await filter.getByRole("radio", { name: "Comments in" }).click();
  await expect(titles).toHaveCount(2);
  await expect(folderCard(page, "My projects").locator(".gf-meta")).toHaveText("1 project");
  // Subfolders count: the banner sits three folders down in Client work.
  await expect(folderCard(page, "Client work").locator(".gf-meta")).toHaveText("1 project in all");
  await expect(folderCard(page, "Café menus")).toHaveCount(0);

  await filter.getByRole("radio", { name: "Ready to review" }).click();
  await expect(folderCard(page, "My projects").locator(".gf-meta")).toHaveText("3 projects");
  await expect(folderCard(page, "Café menus").locator(".gf-meta")).toHaveText("1 project");
  await expect(folderCard(page, "Client work")).toHaveCount(0);

  // Nothing resolved: an empty state with a way back to every folder.
  await filter.getByRole("radio", { name: "Comments resolved" }).click();
  const empty = page.getByTestId("dashboard-empty");
  await expect(empty).toContainText("No projects with this status");
  await empty.getByRole("button", { name: "Show all" }).click();
  await expect(filter.getByRole("radio", { name: "All" })).toHaveAttribute("aria-checked", "true");
  // Its button went with the empty state: focus lands on the filter's new choice, not the page.
  await expect(filter.getByRole("radio", { name: "All" })).toBeFocused();
  await expect(titles).toHaveCount(3);
});
