import type { Page } from "@playwright/test";
import { expect, test } from "./test";
import {
  DEFAULT_FOLDER,
  folderCard,
  openOverview,
  seedWorkspace,
  shareWorkspaceProject,
} from "./squint-fixtures";
import { addWaitingClientComment, workspaceRows } from "./workspace-db";
import { WORKSPACE_SEED } from "./workspace-seed";

test.beforeEach(async ({ page }) => {
  // The website cards ask for the site's favicon; keep the specs off the network.
  await page.route("https://example.com/**", (route) => route.abort());
});

/** The seed (no comments), plus a shared project in My projects whose client has commented. */
async function seedWaiting(page: Page): Promise<string> {
  await seedWorkspace(page, WORKSPACE_SEED, "/sandbox");
  const { projectId } = await shareWorkspaceProject(page, "Shared site");
  await addWaitingClientComment(projectId, {
    id: "waiting-1",
    body: "Is this the final logo?",
    author: "Cleo",
    createdAt: Date.now(),
  });
  return projectId;
}

function projectCard(page: Page, name: string) {
  return page.getByTestId("project-card").filter({ hasText: name });
}

test("a client's comment still on the review link counts on its card, folder and Overview, unopened", async ({
  page,
}) => {
  await seedWaiting(page);

  await page.goto(`/f/${DEFAULT_FOLDER.id}`);
  const card = projectCard(page, "Shared site");
  await expect(card.getByTestId("project-card-comments")).toHaveText("1 active,");
  await expect(card.getByTestId("status-chip")).toHaveAttribute("data-status", "comments");
  await expect(projectCard(page, "Homepage").getByTestId("project-card-comments")).toHaveText(
    "0 active,",
  );
  await expect(page.getByRole("list", { name: "Folder summary" })).toContainText(
    "1 with active comments",
  );

  // Folders: Comments in finds the folder holding it.
  await page.goto("/folders");
  await page
    .getByRole("radiogroup", { name: "Filter by status" })
    .getByRole("radio", { name: "Comments in" })
    .click();
  await expect(folderCard(page, DEFAULT_FOLDER.name).locator(".gf-meta")).toHaveText("1 project");
  await expect(page.getByTestId("folder-card")).toHaveCount(1);

  await openOverview(page);
  await expect(page.getByTestId("tile-status")).toHaveAttribute("data-open", "1");
  await expect(page.getByTestId("tile-waiting")).toHaveAttribute("data-count", "1");

  // Opening the project pulls it in: still one, never two.
  await page.goto(`/f/${DEFAULT_FOLDER.id}`);
  await projectCard(page, "Shared site").getByRole("link").first().click();
  await expect(page).toHaveURL(/\/p\/shared-/);
  await expect.poll(() => workspaceRows("comments")).toBe(1);
  await page.goBack();
  await expect(projectCard(page, "Shared site").getByTestId("project-card-comments")).toHaveText(
    "1 active,",
  );
  await openOverview(page);
  await expect(page.getByTestId("tile-waiting")).toHaveAttribute("data-count", "1");
});
