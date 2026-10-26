import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createImageProject,
  folderCard,
  openFolder,
  openOverview,
  postComment,
} from "./squint-fixtures";

/** Fills the New folder dialog (whatever opened it) and waits for the new folder's page. */
async function nameNewFolder(page: Page, title: string | RegExp, name: string) {
  const dialog = page.getByRole("dialog", { name: title });
  await dialog.getByLabel("Folder name").fill(name);
  await dialog.getByRole("button", { name: "Create folder" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
}

/** "New folder inside" from the folder page's own menu. */
async function newSubfolder(page: Page, parent: string, name: string) {
  await page.getByTestId("folder-menu").click();
  await page.getByRole("menuitem", { name: "New folder inside" }).click();
  await nameNewFolder(page, `New folder in ${parent}`, name);
}

function treeItem(page: Page, name: string): Locator {
  return page.getByRole("treeitem", { name: new RegExp(`^${name} \\d`) });
}

function breadcrumb(page: Page): Locator {
  return page.getByRole("navigation", { name: "Breadcrumb" });
}

test("folders nest: Alpha > Beta > Gamma > Delta, with breadcrumbs, subfolders and the tree", async ({
  page,
}) => {
  await openFolder(page);
  await page.getByTestId("new-folder").click();
  await nameNewFolder(page, "New folder", "Alpha");
  await newSubfolder(page, "Alpha", "Beta");
  // From the sidebar tree's menu too.
  await treeItem(page, "Beta").getByTestId("folder-tree-menu").click();
  await page.getByRole("menuitem", { name: "New folder inside" }).click();
  await nameNewFolder(page, "New folder in Beta", "Gamma");
  await newSubfolder(page, "Gamma", "Delta");

  // The tree shows where Delta is: its ancestors open, each a level deeper.
  await expect(treeItem(page, "Delta")).toHaveAttribute("aria-current", "page");
  await expect(treeItem(page, "Delta")).toHaveAttribute("aria-level", "4");
  for (const name of ["Alpha", "Beta", "Gamma"]) {
    await expect(treeItem(page, name)).toHaveAttribute("aria-expanded", "true");
  }

  // Deep: the middle folds behind "…", which unfolds in place.
  const crumbs = breadcrumb(page);
  await expect(crumbs.getByRole("listitem")).toHaveText([
    "Overview",
    "Alpha",
    "…",
    "Gamma",
    "Delta",
  ]);
  await expect(crumbs.getByText("Delta")).toHaveAttribute("aria-current", "page");
  await crumbs.getByRole("button", { name: "Show 1 more folder" }).click();
  await expect(crumbs.getByRole("link", { name: "Beta" })).toBeFocused();
  await crumbs.getByRole("link", { name: "Beta" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Beta");
  await expect(breadcrumb(page).getByRole("listitem")).toHaveText(["Overview", "Alpha", "Beta"]);

  // A project deep inside counts for every folder above it.
  await treeItem(page, "Gamma").click();
  await createImageProject(page, "deep.png");
  await page.getByRole("link", { name: "Back to Gamma" }).click();
  await breadcrumb(page).getByRole("link", { name: "Alpha" }).click();
  const subfolders = page.getByRole("region", { name: "Subfolders" });
  await expect(subfolders.getByTestId("folder-card").filter({ hasText: "Beta" })).toContainText(
    "1 project in all",
  );
  await expect(treeItem(page, "Alpha")).toContainText("1");

  // The Overview shows top-level folders only, counting what's inside.
  await breadcrumb(page).getByRole("link", { name: "Overview" }).click();
  const cards = page.getByTestId("folder-card");
  await expect(cards).toHaveCount(2);
  await expect(folderCard(page, "Alpha")).toContainText("1 project in all");
  await expect(folderCard(page, "Beta")).toHaveCount(0);
});

test("the sidebar tree works from the keyboard and remembers what's open", async ({ page }) => {
  await openFolder(page);
  await page.getByTestId("new-folder").click();
  await nameNewFolder(page, "New folder", "Alpha");
  await newSubfolder(page, "Alpha", "Beta");
  await page.getByTestId("new-folder").click();
  await nameNewFolder(page, "New folder", "Omega");

  const alpha = treeItem(page, "Alpha");
  await treeItem(page, "Omega").focus();
  await page.keyboard.press("Home");
  await expect(treeItem(page, "My projects")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(alpha).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(alpha).toHaveAttribute("aria-expanded", "false");
  await expect(treeItem(page, "Beta")).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(alpha).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  await expect(treeItem(page, "Beta")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(alpha).toBeFocused();
  await page.keyboard.press("End");
  await expect(treeItem(page, "Omega")).toBeFocused();
  // One Tab stop: Shift+Tab leaves the tree.
  await expect(page.getByRole("tree").locator('[tabindex="0"]')).toHaveCount(1);
  // Shift+F10 opens the focused folder's menu; Escape brings focus back to the folder.
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "New folder inside" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(treeItem(page, "Omega")).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);

  // The tree passes axe, nested and with its row menus.
  const axe = await new AxeBuilder({ page }).include('[role="tree"]').analyze();
  expect(axe.violations.map(({ id, nodes }) => ({ id, nodes: nodes.length }))).toEqual([]);

  // Closed folders stay closed after a reload; Enter opens a folder's page.
  await alpha.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(alpha).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(treeItem(page, "Alpha")).toHaveAttribute("aria-expanded", "false");
  await treeItem(page, "Alpha").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Alpha");
  await expect(treeItem(page, "Alpha")).toHaveAttribute("aria-current", "page");
});

/** "Move folder" from the folder page's own menu. */
async function openMoveFolder(page: Page): Promise<Locator> {
  await page.getByTestId("folder-menu").click();
  await page.getByRole("menuitem", { name: "Move folder" }).click();
  return page.getByRole("dialog", { name: "Move folder" });
}

test("a folder moves under another folder, never into itself or its own subfolders", async ({
  page,
}) => {
  await openFolder(page);
  await page.getByTestId("new-folder").click();
  await nameNewFolder(page, "New folder", "Alpha");
  await newSubfolder(page, "Alpha", "Beta");
  await newSubfolder(page, "Beta", "Gamma");
  await page.getByTestId("new-folder").click();
  await nameNewFolder(page, "New folder", "Omega");
  await treeItem(page, "Beta").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Beta");

  let dialog = await openMoveFolder(page);
  const option = (name: string) => dialog.getByRole("radio", { name: new RegExp(`^${name}`) });
  await expect(option("Top level")).toBeEnabled();
  await expect(option("Alpha")).toBeDisabled();
  await expect(option("Beta")).toBeDisabled();
  await expect(option("Gamma")).toBeDisabled();
  await expect(dialog.getByTestId("folder-tree-picker")).toContainText("Inside this folder");
  await option("Omega").check();
  await dialog.getByTestId("move-folder-submit").click();
  await expect(page.getByTestId("toast")).toContainText("Moved Beta into Omega");
  await expect(breadcrumb(page).getByRole("listitem")).toHaveText(["Overview", "Omega", "Beta"]);
  await expect(treeItem(page, "Beta")).toHaveAttribute("aria-level", "2");
  await expect(treeItem(page, "Alpha")).not.toHaveAttribute("aria-expanded");

  // Omega can't go into Beta or Gamma now: they're inside it.
  await treeItem(page, "Omega").click();
  dialog = await openMoveFolder(page);
  await expect(option("Beta")).toBeDisabled();
  await expect(option("Gamma")).toBeDisabled();
  await expect(option("Top level")).toBeDisabled();
  await option("Alpha").check();
  await dialog.getByTestId("move-folder-submit").click();
  await expect(breadcrumb(page).getByRole("listitem")).toHaveText(["Overview", "Alpha", "Omega"]);
});

test("deleting a folder deletes everything inside it, counted first, and revokes its links", async ({
  page,
}) => {
  await openFolder(page);
  await page.getByTestId("new-folder").click();
  await nameNewFolder(page, "New folder", "Alpha");
  await createImageProject(page, "top.png");
  await page.getByRole("link", { name: "Back to Alpha" }).click();
  await newSubfolder(page, "Alpha", "Beta");
  await createImageProject(page, "inner.png");
  await postComment(page, "Inner note", { x: 100, y: 80 }, "Ana");
  await page.getByTestId("share-button").click();
  const share = page.getByTestId("share-dialog");
  await share.getByTestId("create-share-link").click();
  const link = await share.getByTestId("share-url").inputValue();
  await expect(share.getByTestId("sync-status")).toContainText("Synced");
  await page.keyboard.press("Escape");
  expect((await page.request.get(link)).status()).toBe(200);

  await page.getByRole("link", { name: "Back to Beta" }).click();
  await breadcrumb(page).getByRole("link", { name: "Alpha" }).click();
  await page.getByTestId("folder-menu").click();
  await page.getByRole("menuitem", { name: "Delete folder" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete Alpha?" });
  await expect(confirm.getByTestId("folder-delete-counts").getByRole("listitem")).toHaveText([
    "1 subfolder",
    "2 projects",
    "1 comment",
    "1 share link stops working",
  ]);
  await expect(confirm).toContainText("This can't be undone.");
  // Comments and a share link go with it, so its name must be typed first; Enter alone
  // never deletes.
  const typed = confirm.getByLabel("Type Alpha to confirm");
  await expect(typed).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(confirm.getByRole("alert")).toContainText("Type Alpha to confirm");
  await expect(confirm).toBeVisible();
  await typed.fill("Alpha");
  await confirm.getByRole("button", { name: "Delete folder" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("toast")).toContainText("Deleted Alpha");
  // The menu that opened the dialog went with the folder: focus lands on the page, not nowhere.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.closest("main") !== null))
    .toBe(true);
  await expect(treeItem(page, "Alpha")).toHaveCount(0);
  await expect(treeItem(page, "Beta")).toHaveCount(0);
  await expect
    .poll(async () => (await page.request.get(link)).status(), { timeout: 10_000 })
    .toBe(404);
});

test("Move folder fits a phone with a long folder name, its reasons in full, and passes axe", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const long = "Quarterly campaign assets for the spring product launch and partner events";
  await openFolder(page);
  await page.getByTestId("new-folder").click();
  await nameNewFolder(page, "New folder", long);
  await newSubfolder(page, long, "Beta");

  const dialog = await openMoveFolder(page);
  await expect(dialog.getByTestId("folder-tree-picker")).toBeVisible();
  // Nothing scrolls sideways: not the page, not the dialog.
  const overflow = await page.evaluate(() => {
    const panel = document.querySelector('[role="dialog"]');
    return {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      dialog: panel ? panel.scrollWidth - panel.clientWidth : -1,
    };
  });
  expect(overflow).toEqual({ page: 0, dialog: 0 });
  // Each reason shows in full, inside the dialog.
  const panel = await dialog.boundingBox();
  for (const reason of ["Already here", "This folder"]) {
    const text = dialog.getByText(reason, { exact: true });
    await expect(text).toBeVisible();
    expect(await text.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const box = await text.boundingBox();
    expect(box && panel && box.x + box.width <= panel.x + panel.width).toBe(true);
  }
  // Once the dialog has finished popping in: mid-fade, its colors aren't the real ones.
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        for (let node: Element | null = element; node; node = node.parentElement) {
          if (getComputedStyle(node).opacity !== "1") return false;
        }
        return true;
      }),
    )
    .toBe(true);
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(axe.violations.map(({ id, nodes }) => ({ id, nodes: nodes.length }))).toEqual([]);
});

test("New folder beside New project makes one where you are: top level, then inside the open folder", async ({
  page,
  isMobile,
}) => {
  await openOverview(page);
  // The toolbar's on wide screens, the sidebar's (icon-only on phones) where it stacks above.
  const newFolder = page
    .getByTestId("toolbar-new-folder")
    .or(page.getByTestId("sidebar-new-folder"))
    .filter({ visible: true });
  await expect(newFolder).toHaveAccessibleName("New folder");
  const box = await newFolder.boundingBox();
  expect(box && box.width >= 44 && box.height >= 44).toBe(true);
  if (!isMobile) await expect(page.getByTestId("new-project")).toBeHidden();

  await newFolder.click();
  await nameNewFolder(page, "New folder", "Alpha");
  await newFolder.click();
  await nameNewFolder(page, "New folder in Alpha", "Beta");
  await expect(breadcrumb(page).getByRole("listitem")).toHaveText(["Overview", "Alpha", "Beta"]);
});
