import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  DEFAULT_FOLDER,
  OVERVIEW_HEADLINE,
  folderCard,
  mockFrameCheck,
  openOverview,
  sheetLift,
} from "./squint-fixtures";

function overviewLink(page: Page): Locator {
  // The sidebar's: folder pages also have one in their breadcrumb.
  return page
    .getByRole("complementary", { name: "Workspace" })
    .getByRole("link", { name: "Overview", exact: true });
}

/** Creates a website project through the New project dialog, which stays on the Overview. */
async function addUrlProject(page: Page, url: string, name: string): Promise<void> {
  await page.getByTestId("new-project").click();
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

test("a first visit shows the Overview welcome and an empty state", async ({ page }) => {
  await openOverview(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(OVERVIEW_HEADLINE.empty);
  await expect(page.getByTestId("overview-empty")).toBeVisible();
  await expect(page.getByTestId("folder-card")).toHaveCount(0);
  await expect(overviewLink(page)).toHaveAttribute("aria-current", "page");

  await page.getByTestId("overview-empty-action").click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await expect(dialog.getByLabel("Folder", { exact: true })).toHaveValue(DEFAULT_FOLDER.id);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
});

test("creating a project on the Overview stays there and drops it into its folder", async ({
  page,
}) => {
  await openOverview(page);
  await addUrlProject(page, "example.com", "Homepage");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("toast")).toContainText("Added Homepage to My projects");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(OVERVIEW_HEADLINE.filled);
  const card = folderCard(page, DEFAULT_FOLDER.name);
  await expect(card.locator(".gf-meta")).toHaveText("1 project");
  await expect(
    // The name is built from the sheet's spans, so Chrome may space the commas.
    card.getByRole("link", { name: /^Homepage\s*,\s*example\.com\s*,\s*Ready to review$/ }),
  ).toHaveCount(1);
  // Each sheet's name must contain its visible text (WCAG 2.5.3).
  const axe = await new AxeBuilder({ page })
    .include('[data-testid="folder-sheet"]')
    .withRules(["label-content-name-mismatch"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await expect(card.locator(".gf-front.gf-bump")).toHaveCount(0);

  // A project added while its folder is on screen drops in, and the pocket gives under it.
  await addUrlProject(page, "example.com/pricing", "Pricing");
  await expect(card.locator(".gf-meta")).toHaveText("2 projects");
  await expect(card.locator(".gf-front.gf-bump")).toHaveCount(1);
});

test("a folder is one link to its page, with a decorative mascot key and no extra buttons", async ({
  page,
  isMobile,
}) => {
  await openOverview(page);
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

test("hovering a folder fans its projects out, and each one opens", async ({ page, isMobile }) => {
  test.skip(isMobile, "Touch has no hover: a tap follows the folder's link.");
  await openOverview(page);
  await addUrlProject(page, "example.com", "Homepage");
  const card = folderCard(page, DEFAULT_FOLDER.name);
  const sheet = card.getByRole("link", { name: /^Homepage\s*,\s*example\.com/ });

  await page.mouse.move(0, 0);
  await expect.poll(() => sheetLift(sheet)).toBeGreaterThan(0);
  await card.getByTestId("glass-folder").hover({ position: { x: 20, y: 200 } });
  await expect.poll(() => sheetLift(sheet)).toBeLessThan(-40);

  await sheet.click({ position: { x: 48, y: 12 } });
  await expect(page).toHaveURL(/\/p\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Homepage" })).toBeVisible();
});

test("Tab moves from the folder to its projects, then its menu, fanning them out", async ({
  page,
  isMobile,
}) => {
  await openOverview(page);
  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "New project" });
  await dialog.getByLabel("Website address").fill("example.com");
  await dialog.getByLabel("Project name").fill("Keyboard check");
  await dialog.getByTestId("create-project").click();
  await expect(dialog).toHaveCount(0);

  const card = folderCard(page, DEFAULT_FOLDER.name);
  const folderLink = card.getByRole("link", { name: /^Open My projects/ });
  const sheet = card.getByRole("link", { name: /^Keyboard check/ });
  await folderLink.focus();
  if (isMobile) {
    // Touch screens never fan: the folder is one link, and its page lists every project.
    await page.keyboard.press("Tab");
    await expect(card.getByTestId("folder-card-menu")).toBeFocused();
    await expect(sheet).toHaveAttribute("tabindex", "-1");
    return;
  }
  await page.keyboard.press("Tab");
  await expect(sheet).toBeFocused();
  await expect.poll(() => sheetLift(sheet)).toBeLessThan(-40);
  await page.keyboard.press("Tab");
  await expect(card.getByTestId("folder-card-menu")).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(sheet).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/p\/[^/]+$/);
});

test("the corner menu renames a folder and protects the last one", async ({ page }) => {
  await openOverview(page);
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
  await openOverview(page);
  await addUrlProject(page, "example.com", "Homepage");
  await addFolder(page, "Client work");

  await folderCard(page, "Client work").getByTestId("folder-card-menu").click();
  await page.getByRole("menuitem", { name: "Delete folder" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete Client work?" });
  await confirm.getByRole("button", { name: "Delete folder" }).click();
  await expect(page.getByTestId("toast")).toContainText("Deleted Client work");
  await expect(folderCard(page, "Client work")).toHaveCount(0);
  await expect(page.getByTestId("folder-card")).toHaveCount(1);
});

test("old ?folder= links redirect and unknown folders offer a way back", async ({ page }) => {
  await page.goto(`/?folder=${DEFAULT_FOLDER.id}`);
  await expect(page).toHaveURL(new RegExp(`/f/${DEFAULT_FOLDER.id}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(DEFAULT_FOLDER.name);

  await page.goto("/f/does-not-exist");
  await expect(page.getByTestId("folder-not-found")).toBeVisible();
  await page.getByRole("link", { name: "Back to Overview" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(overviewLink(page)).toHaveAttribute("aria-current", "page");
});

test("stacked folder sheets are not tiny targets, at rest or fanned", async ({
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
    // Stacked, the sheets aren't tab stops: the folder's link stands for them.
    await expect(sheets.first()).toHaveAttribute("tabindex", "-1");
    const atRest = await new AxeBuilder({ page }).withRules(["target-size"]).analyze();
    expect(atRest.violations).toEqual([]);
    // Touch screens never fan, so the stack is all there is to check.
    if (isMobile) continue;

    // Keyboard focus on the folder fans the files out and makes them reachable.
    await page.getByTestId("folder-link").first().focus();
    await page.keyboard.press("Tab");
    await expect(sheets.first()).toBeFocused();
    await expect.poll(() => sheetLift(sheets.first())).toBeLessThan(-40);
    const fanned = await new AxeBuilder({ page }).withRules(["target-size"]).analyze();
    expect(fanned.violations).toEqual([]);
  }
});
