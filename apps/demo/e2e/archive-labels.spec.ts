import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./test";
import { SIGNED_OUT } from "./auth-fixtures";
import {
  DEFAULT_FOLDER,
  folderCard,
  openFolder,
  seedWorkspace,
  shareWorkspaceProject,
  skipReviewGuide,
} from "./squint-fixtures";
import { WORKSPACE_SEED } from "./workspace-seed";

test.beforeEach(async ({ page }) => {
  // The website card asks for the site's favicon; keep the specs off the network.
  await page.route("https://example.com/**", (route) => route.abort());
});

function card(page: Page, name: string): Locator {
  return page.getByTestId("project-card").filter({ hasText: name });
}

async function chooseFromMenu(page: Page, name: string, item: string): Promise<void> {
  await card(page, name).getByTestId("project-menu").click();
  await page.getByRole("menuitem", { name: item }).click();
}

function statusFilter(page: Page): Locator {
  return page.getByRole("radiogroup", { name: "Filter by status" });
}

async function chooseLabel(page: Page, label: string): Promise<void> {
  await page.getByTestId("label-filter").click();
  await page.getByRole("menuitemradio", { name: label }).click();
}

test("an archived project leaves the grid, counts and Overview until Archived shows it; it opens with a banner and unarchives", async ({
  page,
  isMobile,
}) => {
  await seedWorkspace(page, WORKSPACE_SEED, `/f/${DEFAULT_FOLDER.id}`);
  await expect(page.getByTestId("project-card")).toHaveCount(4);

  await chooseFromMenu(page, "Hero shot", "Archive");
  await expect(card(page, "Hero shot")).toHaveCount(0);
  await expect(page.getByTestId("project-card")).toHaveCount(3);
  await expect(page.getByTestId("toast").filter({ hasText: "Archived Hero shot" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Folder summary" })).toContainText("3 projects");
  if (!isMobile) {
    await expect(page.getByRole("treeitem", { name: /^My projects 3 projects/ })).toBeVisible();
  }

  // The Overview counts what's left: six projects seeded, one archived.
  await page.goto("/");
  await expect(page.getByTestId("overview-hero")).toContainText("5 projects in 3 folders.");

  // Folders leaves it out too, until Archived is chosen.
  await page.goto("/folders");
  await expect(folderCard(page, "My projects").locator(".gf-meta")).toHaveText("3 projects");
  await statusFilter(page).getByRole("radio", { name: "Archived" }).click();
  await expect(page.getByTestId("folder-card")).toHaveCount(1);
  await expect(folderCard(page, "My projects").locator(".gf-meta")).toHaveText("1 project");

  await page.goto(`/f/${DEFAULT_FOLDER.id}`);
  await statusFilter(page).getByRole("radio", { name: "Archived" }).click();
  const archived = card(page, "Hero shot");
  await expect(page.getByTestId("project-card")).toHaveCount(1);
  await expect(archived.getByTestId("archived-chip")).toBeVisible();
  await expect(archived.getByTestId("archived-deletes")).toContainText("Deletes for good on");

  await archived.getByRole("link", { name: /^Hero shot/ }).click();
  const banner = page.getByTestId("archived-banner");
  await expect(banner).toContainText("Archived.");
  await expect(banner).toContainText("Deletes for good on");
  // The link is closed while archived, so Share waits until it's back.
  await expect(page.getByTestId("share-button")).toHaveCount(0);

  await banner.getByRole("button", { name: "Unarchive" }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.getByTestId("toast").filter({ hasText: "Unarchived Hero shot" })).toBeVisible();
  await expect(page.getByTestId("share-button")).toBeVisible();

  // Saved: a fresh load shows it back in the grid.
  await page.goto(`/f/${DEFAULT_FOLDER.id}`);
  await expect(page.getByTestId("project-card")).toHaveCount(4);
  await expect(card(page, "Hero shot").getByTestId("status-chip")).toBeVisible();
});

test("a project's label is set from its menu, suggested for others, filtered by and cleared", async ({
  page,
}) => {
  await seedWorkspace(page, WORKSPACE_SEED, `/f/${DEFAULT_FOLDER.id}`);
  // No labels yet: nothing to filter by.
  await expect(page.getByTestId("label-filter")).toHaveCount(0);

  await chooseFromMenu(page, "Hero shot", "Add label");
  const dialog = page.getByRole("dialog", { name: "Add a label" });
  await dialog.getByTestId("label-save").click();
  await expect(dialog.getByRole("alert")).toContainText("Enter a label.");
  await dialog.getByLabel("Label", { exact: true }).fill("  Client   review ");
  await dialog.getByTestId("label-save").click();
  await expect(dialog).toBeHidden();
  await expect(card(page, "Hero shot").getByTestId("label-chip")).toHaveText(
    "Label: Client review",
  );

  // Labels in use are offered as suggestions; picking one sets it.
  await chooseFromMenu(page, "Mockups", "Add label");
  await page.getByRole("dialog", { name: "Add a label" }).getByTestId("label-suggestion").click();
  await expect(card(page, "Mockups").getByTestId("label-chip")).toContainText("Client review");

  await chooseFromMenu(page, "Pitch deck", "Add label");
  await page.getByRole("dialog", { name: "Add a label" }).getByLabel("Label").fill("Internal");
  await page.keyboard.press("Enter");
  await expect(card(page, "Pitch deck").getByTestId("label-chip")).toContainText("Internal");

  await chooseLabel(page, "Client review");
  await expect(page.getByTestId("project-card")).toHaveCount(2);
  await chooseLabel(page, "Internal");
  await expect(page.getByTestId("project-card")).toHaveCount(1);
  await expect(card(page, "Pitch deck")).toHaveCount(1);
  await chooseLabel(page, "All labels");
  await expect(page.getByTestId("project-card")).toHaveCount(4);

  // Cleared from Mockups; Hero shot keeps its own.
  await chooseFromMenu(page, "Mockups", "Change label");
  await page.getByRole("dialog", { name: "Change label" }).getByTestId("label-remove").click();
  await expect(card(page, "Mockups").getByTestId("label-chip")).toHaveCount(0);
  await chooseLabel(page, "Client review");
  await expect(page.getByTestId("project-card")).toHaveCount(1);
  await expect(card(page, "Hero shot")).toHaveCount(1);

  // Saved, and Folders filters by label too.
  await page.goto("/folders");
  await chooseLabel(page, "Internal");
  await expect(page.getByTestId("folder-card")).toHaveCount(1);
  await expect(folderCard(page, "My projects").locator(".gf-meta")).toHaveText("1 project");
});

test("an archived project's review link is unavailable to a guest until it's unarchived", async ({
  page,
  browser,
}) => {
  const { token } = await shareWorkspaceProject(page, "Launch site");
  const guestContext = await browser.newContext({ storageState: SIGNED_OUT });
  const guest = await guestContext.newPage();
  await skipReviewGuide(guest);
  await guest.route("https://example.com/**", (route) => route.abort());
  expect((await guest.goto(`/s/${token}`))?.status()).toBe(200);
  await expect(guest.getByTestId("share-unavailable")).toHaveCount(0);

  await openFolder(page);
  await chooseFromMenu(page, "Launch site", "Archive");
  await expect(card(page, "Launch site")).toHaveCount(0);
  // The store saves in the background: wait for the link to close.
  const linkStatus = async () => (await guest.request.get(`/api/s/${token}`)).status();
  await expect.poll(linkStatus).toBe(404);
  expect((await guest.goto(`/s/${token}`))?.status()).toBe(404);
  await expect(guest.getByTestId("share-unavailable")).toBeVisible();

  await statusFilter(page).getByRole("radio", { name: "Archived" }).click();
  await chooseFromMenu(page, "Launch site", "Unarchive");
  await expect(card(page, "Launch site")).toHaveCount(0);
  await expect(
    page.getByTestId("toast").filter({ hasText: "Unarchived Launch site" }),
  ).toBeVisible();
  await expect.poll(linkStatus).toBe(200);
  expect((await guest.goto(`/s/${token}`))?.status()).toBe(200);
  await expect(guest.getByTestId("share-unavailable")).toHaveCount(0);
  await guestContext.close();
});
