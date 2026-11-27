import type { Page } from "@playwright/test";
import { expect, test } from "./test";
import type { Comment, SquintData } from "../lib/store/types";
import { DEFAULT_FOLDER, folderCard, seedWorkspace } from "./squint-fixtures";
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

/** Chooses `stage` from the Stage group of the named project's Actions menu. */
async function setStageFromCard(page: Page, name: string, stage: string): Promise<void> {
  const card = page.getByTestId("project-card").filter({ hasText: name });
  await card.getByTestId("project-menu").click();
  await page
    .getByRole("group", { name: "Stage" })
    .getByRole("menuitemradio", { name: stage })
    .click();
}

test("a card's Actions set its stage, the stage filter narrows to it, and Undo puts it back", async ({
  page,
}) => {
  await page.route("https://example.com/**", (route) => route.abort());
  await seedWorkspace(page, WORKSPACE_SEED, `/f/${DEFAULT_FOLDER.id}`);
  const cards = page.getByTestId("project-card");
  const hero = cards.filter({ hasText: "Hero shot" });
  const filter = page.getByTestId("stage-filter");
  await expect(cards).toHaveCount(4);
  // No project has a stage yet: nothing to filter by.
  await expect(filter).toHaveCount(0);

  await setStageFromCard(page, "Hero shot", "On hold");
  // The outlined chip comes after the status, read as "Stage: On hold".
  await expect(hero.getByTestId("stage-chip")).toHaveText("Stage: On hold");
  await expect(page.getByTestId("toast").filter({ hasText: "Stage set to On hold" })).toBeVisible();
  await expect(filter).toHaveAccessibleName("Stage: All stages");

  await filter.click();
  await page.getByRole("menuitemradio", { name: "On hold" }).click();
  await expect(filter).toHaveAccessibleName("Stage: On hold");
  await expect(cards).toHaveCount(1);
  await expect(page.getByTestId("filter-count")).toHaveText("1 project shown");

  // Moved on from On hold, it leaves the filtered list, and the stage's empty state says so.
  await setStageFromCard(page, "Hero shot", "Approved");
  const empty = page.getByTestId("dashboard-empty");
  await expect(empty).toContainText("Try another stage, label or status");
  const toast = page.getByTestId("toast").filter({ hasText: "Stage set to Approved" });
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(hero.getByTestId("stage-chip")).toHaveText("Stage: On hold");
  await expect(cards).toHaveCount(1);
  // Focus follows the card back from the toast.
  await expect(hero.getByRole("link")).toBeFocused();

  // Saved: after a reload the card keeps it, and No stage shows the other three.
  await page.reload();
  await expect(hero.getByTestId("stage-chip")).toHaveText("Stage: On hold");
  await filter.click();
  await page.getByRole("menuitemradio", { name: "No stage" }).click();
  await expect(cards).toHaveCount(3);
  await expect(hero).toHaveCount(0);
});
