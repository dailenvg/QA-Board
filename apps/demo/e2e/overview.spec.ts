import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addDefaultFolder,
  DEFAULT_FOLDER,
  OVERVIEW_HEADLINE,
  folderCard,
  mockFrameCheck,
  newProjectButton,
  openOverview,
  seedWorkspace,
  sheetLift,
} from "./squint-fixtures";
import { WORKSPACE_SEED } from "./workspace-seed";

function overviewLink(page: Page): Locator {
  // The sidebar's: folder pages also have one in their breadcrumb.
  return page
    .getByRole("complementary", { name: "Workspace" })
    .getByRole("link", { name: "Overview", exact: true });
}

/** Creates a website project through the New project dialog, which stays on the Overview. */
async function addUrlProject(page: Page, url: string, name: string): Promise<void> {
  await newProjectButton(page).click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await dialog.getByLabel("Website address").fill(url);
  await dialog.getByLabel("Project name").fill(name);
  await dialog.getByTestId("create-project").click();
  await expect(dialog).toHaveCount(0);
}

async function addFolder(page: Page, name: string): Promise<void> {
  await page.getByTestId("new-folder").click();
  const dialog = page.getByRole("dialog", { name: "New folder" });
  await dialog.getByLabel("Folder name").fill(name);
  await dialog.getByRole("button", { name: "Create folder" }).click();
  await expect(page).toHaveURL(/\/f\/[^/]+$/);
  await overviewLink(page).click();
  await expect(overviewLink(page)).toHaveAttribute("aria-current", "page");
}

test.beforeEach(async ({ page }) => {
  await mockFrameCheck(page, {
    verdict: "embeddable",
    finalUrl: "https://example.com/",
    status: 200,
  });
});

/** The Overview with DEFAULT_FOLDER in place, so New project files into it. */
async function openOverviewWithFolder(page: Page): Promise<void> {
  await addDefaultFolder(page);
  await openOverview(page);
}

test("a first visit shows the welcome, with no folders: the first step is creating one", async ({
  page,
}) => {
  await openOverview(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(OVERVIEW_HEADLINE.empty);
  await expect(page.getByTestId("overview-empty")).toBeVisible();
  await expect(page.getByTestId("folder-card")).toHaveCount(0);
  await expect(page.getByTestId("folder-tree-empty")).toHaveText(
    "No folders yet. Use New folder above.",
  );
  await expect(overviewLink(page)).toHaveAttribute("aria-current", "page");

  const action = page.getByTestId("overview-empty-action");
  await expect(action).toHaveText("Create your first folder");
  await action.click();
  const folderDialog = page.getByRole("dialog", { name: "New folder" });
  await folderDialog.getByLabel("Folder name").fill("Client work");
  await folderDialog.getByRole("button", { name: "Create folder" }).click();
  await expect(page).toHaveURL(/\/f\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Client work");

  // A folder but no projects yet: the next step is the first project, filed in that folder.
  await overviewLink(page).click();
  await expect(action).toHaveText("Add your first project");
  await action.click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await expect(dialog.getByRole("combobox", { name: "Folder", exact: true })).toHaveText(
    "Client work",
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
});

test("New project with no folders asks to name the first folder, then files the project there", async ({
  page,
}) => {
  await openOverview(page);
  await newProjectButton(page).click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await expect(dialog.getByRole("combobox", { name: "Folder", exact: true })).toHaveText(
    "New folder…",
  );
  await dialog.getByLabel("Website address").fill("example.com");
  await dialog.getByTestId("create-project").click();
  await expect(dialog.getByText("Name the new folder.")).toBeVisible();

  await dialog.getByLabel("Name your first folder").fill("Client work");
  await dialog.getByTestId("create-project").click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  const card = folderCard(page, "Client work");
  await expect(card.locator(".gf-meta")).toHaveText("1 project");
});

test("creating a project on the Overview stays there and drops it into its folder", async ({
  page,
}) => {
  await openOverviewWithFolder(page);
  await addUrlProject(page, "example.com", "Homepage");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("toast")).toContainText("Added Homepage to My projects");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(OVERVIEW_HEADLINE.filled);
  const card = folderCard(page, DEFAULT_FOLDER.name);
  await expect(card.locator(".gf-meta")).toHaveText("1 project");
  // A preview of the project in the pocket, not a link of its own: the folder is the one link.
  await expect(card.getByTestId("folder-sheet").filter({ hasText: "Homepage" })).toHaveCount(1);
  await expect(card.getByRole("link")).toHaveCount(1);
  await expect(card.locator(".gf-front.gf-bump")).toHaveCount(0);
  // One folder has no order to choose.
  await expect(page.getByTestId("sort-menu")).toHaveCount(0);

  // A project added while its folder is on screen drops in, and the pocket gives under it.
  await addUrlProject(page, "example.com/pricing", "Pricing");
  await expect(card.locator(".gf-meta")).toHaveText("2 projects");
  await expect(card.locator(".gf-front.gf-bump")).toHaveCount(1);
});

test("a folder is one link to its page, with a decorative mascot key and no extra buttons", async ({
  page,
  isMobile,
}) => {
  await openOverviewWithFolder(page);
  await addUrlProject(page, "example.com", "Homepage");
  const card = folderCard(page, DEFAULT_FOLDER.name);

  const folderLink = card.getByRole("link", { name: "Open My projects, 1 project" });
  await expect(folderLink).toHaveAttribute("href", `/f/${DEFAULT_FOLDER.id}`);
  await expect(folderLink).not.toHaveAttribute("aria-expanded");
  await expect(card.getByRole("link", { name: /View all/ })).toHaveCount(0);
  await expect(card.getByRole("button", { name: /New project/ })).toHaveCount(0);
  // The menu is the card's only button; the mascot key is drawn on the folder's link.
  await expect(card.getByRole("button")).toHaveCount(1);
  const key = card.locator(".gf-key");
  await expect(key).toHaveAttribute("aria-hidden", "true");
  // On a phone the "Added" toast can sit over the key; let it go first.
  await expect(page.getByTestId("toast")).toHaveCount(0, { timeout: 10_000 });
  await key.scrollIntoViewIfNeeded();
  await expect(card.getByTestId("glass-folder")).toHaveAttribute("data-entered");
  await expect(key.locator(".squint-mascot")).toBeVisible();

  const box = await key.boundingBox();
  if (!box) throw new Error("The mascot key has no box.");
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // A tap or a click on the mascot lands on the folder's link underneath it.
  if (isMobile) await page.touchscreen.tap(center.x, center.y);
  else await page.mouse.click(center.x, center.y);
  await expect(page).toHaveURL(new RegExp(`/f/${DEFAULT_FOLDER.id}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(DEFAULT_FOLDER.name);
  await expect(page.getByTestId("project-card")).toHaveCount(1);
  await expect(page.getByRole("treeitem", { name: /^My projects/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(overviewLink(page)).not.toHaveAttribute("aria-current", "page");

  await page.goBack();
  await folderCard(page, DEFAULT_FOLDER.name)
    .getByRole("link", { name: /^Open My projects/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/f/${DEFAULT_FOLDER.id}$`));
});

test("hovering a folder fans its projects out, and a click on one opens the folder", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Touch has no hover: a tap follows the folder's link.");
  await openOverviewWithFolder(page);
  await addUrlProject(page, "example.com", "Homepage");
  const card = folderCard(page, DEFAULT_FOLDER.name);
  const sheet = card.getByTestId("folder-sheet").filter({ hasText: "Homepage" });

  await page.mouse.move(0, 0);
  await expect.poll(() => sheetLift(sheet)).toBeGreaterThan(0);
  await card.getByTestId("glass-folder").hover({ position: { x: 20, y: 200 } });
  await expect.poll(() => sheetLift(sheet)).toBeLessThan(-40);

  await sheet.click({ position: { x: 48, y: 12 } });
  await expect(page).toHaveURL(new RegExp(`/f/${DEFAULT_FOLDER.id}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(DEFAULT_FOLDER.name);
});

test("Tab moves from the folder straight to its menu; focus fans the projects out", async ({
  page,
  isMobile,
}) => {
  await openOverviewWithFolder(page);
  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "New project" });
  await dialog.getByLabel("Website address").fill("example.com");
  await dialog.getByLabel("Project name").fill("Keyboard check");
  await dialog.getByTestId("create-project").click();
  await expect(dialog).toHaveCount(0);

  const card = folderCard(page, DEFAULT_FOLDER.name);
  const folderLink = card.getByRole("link", { name: /^Open My projects/ });
  const sheet = card.getByTestId("folder-sheet").filter({ hasText: "Keyboard check" });
  // The sheet is a preview: the folder's link is the card's only way in.
  await expect(card.getByRole("link")).toHaveCount(1);
  const menu = card.getByTestId("folder-card-menu");
  // Reached by keyboard, so focus is visible (a programmatic focus after clicks isn't).
  await menu.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(folderLink).toBeFocused();
  // Touch screens never fan; elsewhere keyboard focus on the folder fans its projects out.
  if (!isMobile) await expect.poll(() => sheetLift(sheet)).toBeLessThan(-40);
  await page.keyboard.press("Tab");
  await expect(menu).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(folderLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/f/${DEFAULT_FOLDER.id}$`));
});

test("sorting the Overview's folders reorders them and is remembered after a reload", async ({
  page,
}) => {
  // My projects holds four projects; Client work (one, two folders down) and Café menus (one)
  // were each updated after them, Café menus last.
  await seedWorkspace(page, WORKSPACE_SEED);
  const titles = page.getByTestId("folder-card").locator(".gf-title");
  const trigger = page.getByTestId("sort-menu");
  const reverse = page.getByTestId("sort-direction");

  await expect(trigger).toHaveAccessibleName("Sort: Last updated");
  await expect(reverse).toHaveAccessibleName("Order: Newest first");
  await expect(titles).toHaveText(["Café menus", "Client work", "My projects"]);

  await trigger.click();
  await page.getByRole("menuitemradio", { name: "Most projects" }).click();
  await expect(reverse).toHaveAccessibleName("Order: Most first");
  // Subfolders' projects count; ties go by name.
  await expect(titles).toHaveText(["My projects", "Café menus", "Client work"]);

  await page.reload();
  await expect(trigger).toHaveAccessibleName("Sort: Most projects");
  await expect(titles).toHaveText(["My projects", "Café menus", "Client work"]);

  await reverse.click();
  await expect(reverse).toHaveAccessibleName("Order: Fewest first");
  await expect(titles).toHaveText(["Café menus", "Client work", "My projects"]);
  await expect(page.getByTestId("sort-status")).toHaveText("Sorted by most projects. Fewest first");

  // Folder pages keep their own order.
  await page.goto(`/f/${DEFAULT_FOLDER.id}`);
  await expect(page.getByTestId("sort-menu")).toHaveAccessibleName("Sort: Date");
});

test("the corner menu renames a folder and protects the last one", async ({ page }) => {
  await openOverviewWithFolder(page);
  await addUrlProject(page, "example.com", "Homepage");

  const card = folderCard(page, DEFAULT_FOLDER.name);
  const trigger = card.getByRole("button", { name: "Actions for My projects" });
  await trigger.scrollIntoViewIfNeeded();
  // Top-right corner of the folder, with a full 44px target once it has assembled.
  await expect.poll(async () => (await trigger.boundingBox())?.width).toBeGreaterThanOrEqual(44);
  const [folderBox, triggerBox] = await Promise.all([
    card.getByTestId("glass-folder").boundingBox(),
    trigger.boundingBox(),
  ]);
  if (!folderBox || !triggerBox) throw new Error("The folder or its menu has no box.");
  expect(triggerBox.height).toBeGreaterThanOrEqual(44);
  expect(triggerBox.x + triggerBox.width).toBeCloseTo(folderBox.x + folderBox.width, 0);
  expect(triggerBox.y).toBeLessThan(folderBox.y + folderBox.height * 0.35);

  await trigger.click();
  await expect(
    page.getByRole("menuitem", { name: "Can't delete your only folder" }),
  ).toBeDisabled();
  await page.getByRole("menuitem", { name: "Rename folder" }).click();
  const rename = page.getByRole("dialog", { name: "Rename folder" });
  await rename.getByLabel("Folder name").fill("Website");
  await rename.getByRole("button", { name: "Save" }).click();
  await expect(folderCard(page, "Website").locator(".gf-title")).toHaveText("Website");
  await expect(
    folderCard(page, "Website").getByRole("link", { name: /^Open Website/ }),
  ).toHaveCount(1);
});

test("with two folders the corner menu deletes one", async ({ page }) => {
  await openOverviewWithFolder(page);
  await addUrlProject(page, "example.com", "Homepage");
  await addFolder(page, "Client work");

  await folderCard(page, "Client work").getByTestId("folder-card-menu").click();
  await page.getByRole("menuitem", { name: "Delete folder" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete Client work?" });
  await confirm.getByRole("button", { name: "Delete folder" }).click();
  // Filtered: the "Added Homepage" toast may still be on its way out.
  await expect(page.getByTestId("toast").filter({ hasText: "Deleted Client work" })).toBeVisible();
  await expect(folderCard(page, "Client work")).toHaveCount(0);
  await expect(page.getByTestId("folder-card")).toHaveCount(1);
});

test("old ?folder= links redirect and unknown folders offer a way back", async ({ page }) => {
  await addDefaultFolder(page);
  await page.goto(`/?folder=${DEFAULT_FOLDER.id}`);
  await expect(page).toHaveURL(new RegExp(`/f/${DEFAULT_FOLDER.id}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(DEFAULT_FOLDER.name);

  await page.goto("/f/does-not-exist");
  await expect(page.getByTestId("folder-not-found")).toBeVisible();
  await page.getByRole("link", { name: "Back to Overview" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(overviewLink(page)).toHaveAttribute("aria-current", "page");
});

test("folder sheets are previews, never tiny targets, at rest or fanned", async ({
  page,
  isMobile,
}) => {
  // Four picture projects in one folder and two in a subfolder: the stacks axe used to flag.
  const now = Date.now();
  const pages = (id: string) => ({
    kind: "pages",
    origin: "image",
    fileName: `${id}.png`,
    pages: [
      { id: `${id}-p`, blobKey: `page:${id}-p`, name: `${id}.png`, width: 1600, height: 1000 },
    ],
  });
  const project = (id: string, folderId: string, index: number) => ({
    id,
    folderId,
    name: `Project ${id}`,
    source: pages(id),
    createdAt: now + index,
    updatedAt: now + index,
  });
  const data = {
    version: 3,
    folders: [
      { id: DEFAULT_FOLDER.id, name: DEFAULT_FOLDER.name, createdAt: now - 10, parentId: null },
      { id: "fa", name: "Alpha", createdAt: now, parentId: null },
      { id: "fb", name: "Beta", createdAt: now + 1, parentId: "fa" },
    ],
    projects: [
      ...["p1", "p2", "p3", "p4"].map((id, index) => project(id, DEFAULT_FOLDER.id, index)),
      ...["p5", "p6"].map((id, index) => project(id, "fb", index + 4)),
    ],
    comments: [],
    snapshots: [],
    revocations: [],
    authorName: null,
  };
  await page.goto("/sandbox");
  await page.evaluate((seed) => localStorage.setItem("squint:v3", JSON.stringify(seed)), data);

  for (const path of ["/", "/f/fa"]) {
    await page.goto(path);
    const sheets = page.getByTestId("folder-sheet");
    await expect(sheets.first()).toBeAttached();
    // Never tab stops or links of their own: the folder's link stands for them.
    await expect(sheets.first()).not.toHaveAttribute("href");
    await expect(sheets.first()).not.toHaveAttribute("tabindex");
    const atRest = await new AxeBuilder({ page })
      .withRules(["target-size", "aria-hidden-focus"])
      .analyze();
    expect(atRest.violations).toEqual([]);
    // Touch screens never fan, so the stack is all there is to check.
    if (isMobile) continue;

    // Keyboard focus on the folder fans the files out; Tab still goes on to its menu.
    const folderLink = page.getByTestId("folder-link").first();
    await folderLink.focus();
    await expect.poll(() => sheetLift(sheets.first())).toBeLessThan(-40);
    const fanned = await new AxeBuilder({ page })
      .withRules(["target-size", "aria-hidden-focus"])
      .analyze();
    expect(fanned.violations).toEqual([]);
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("folder-card-menu").first()).toBeFocused();
  }
});
