import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  DEFAULT_FOLDER,
  openFolder,
  pickImages,
  samplePngFiles,
  seedWorkspace,
  settled,
} from "./squint-fixtures";
import { WORKSPACE_SEED } from "./workspace-seed";

test.beforeEach(async ({ page }) => {
  // The website card asks for the site's favicon; keep the specs off the network.
  await page.route("https://example.com/**", (route) => route.abort());
});

test("combined images show how many there are on their card", async ({ page }) => {
  await openFolder(page);
  const dialog = await pickImages(page, await samplePngFiles(page, ["One", "Two", "Three"]));
  await dialog.getByTestId("grouping-combine").click();
  await dialog.getByTestId("create-project").click();
  await expect(page.getByTestId("page-position")).toHaveText("Page 1 of 3");

  await page.getByRole("link", { name: `Back to ${DEFAULT_FOLDER.name}` }).click();
  const card = page.getByTestId("project-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("3 images");
  await expect(card).not.toContainText("one.png");
});

test("each card names its type, keeps single files' names, and passes axe", async ({ page }) => {
  await seedWorkspace(page, WORKSPACE_SEED, `/f/${DEFAULT_FOLDER.id}`);
  const cards = page.getByTestId("project-card");
  await expect(cards).toHaveCount(4);

  const expected = [
    { name: "Homepage", type: "Website", line: "example.com" },
    { name: "Hero shot", type: "Image", line: "hero.png" },
    { name: "Mockups", type: "Image", line: "3 images" },
    { name: "Pitch deck", type: "PDF", line: "pitch.pdf" },
  ];
  for (const { name, type, line } of expected) {
    const card = cards.filter({ hasText: name });
    // The type is part of the card link's name, after the project's own.
    const link = card.getByRole("link", { name: new RegExp(`^${name}\\s*,\\s*${type}$`) });
    await expect(link).toHaveCount(1);
    // The pill shows the type in words; it's hidden from screen readers, who hear it in the link.
    await expect(card.getByTestId("project-type-tag")).toHaveText(type);
    await expect(card.getByTestId("project-type-tag")).toHaveAttribute("aria-hidden", "true");
    await expect(card).toContainText(line);
  }

  // The tag is part of the link: a click on it opens the project.
  const tag = cards.filter({ hasText: "Pitch deck" }).getByTestId("project-type-tag");
  await settled(cards);
  const axe = await new AxeBuilder({ page }).include('[data-testid="project-card"]').analyze();
  expect(axe.violations.map(({ id, nodes }) => ({ id, nodes: nodes.length }))).toEqual([]);

  await tag.click();
  await expect(page).toHaveURL(/\/p\/deck$/);
});

test("hover draws a brand line around a card; keyboard focus outranks it", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Touch has no hover.");
  await seedWorkspace(page, WORKSPACE_SEED, `/f/${DEFAULT_FOLDER.id}`);
  const card = page.getByTestId("project-card").filter({ hasText: "Homepage" });
  await settled(card);
  const shadow = () => card.evaluate((element) => getComputedStyle(element).boxShadow);
  // Brand and focus share a color in light mode; the 2px gap tells focus apart.
  const line = "rgb(12, 84, 204) 0px 0px 0px 2px";
  const focusRing = "rgb(12, 84, 204) 0px 0px 0px 4px";

  await expect.poll(shadow).not.toContain(line);
  await card.hover();
  await expect.poll(shadow).toContain(line);

  // Still hovered: a key press first, so the focus that follows is keyboard focus.
  await page.keyboard.press("Tab");
  await card.getByRole("link").focus();
  await expect.poll(shadow).toContain(focusRing);
  await expect.poll(shadow).toContain("rgb(231, 231, 234) 0px 0px 0px 2px");
});

test("sorting a folder's projects reorders the cards and is remembered after a reload", async ({
  page,
}) => {
  await seedWorkspace(page, WORKSPACE_SEED, `/f/${DEFAULT_FOLDER.id}`);
  const titles = page.getByTestId("project-card").getByRole("heading", { level: 2 });
  const trigger = page.getByTestId("sort-menu");
  const reverse = page.getByTestId("sort-direction");

  // Newest first by default, as before sorting existed.
  await expect(trigger).toHaveAccessibleName("Sort: Date");
  await expect(reverse).toHaveAccessibleName("Order: Newest first");
  await expect(titles).toHaveText([/^Pitch deck/, /^Mockups/, /^Hero shot/, /^Homepage/]);

  await trigger.click();
  const menu = page.getByRole("menu", { name: "Sort: Date" });
  // Opens on the current option.
  await expect(menu.getByRole("menuitemradio", { name: "Date" })).toBeFocused();
  await expect(menu.getByRole("menuitemradio", { name: "Date" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await menu.getByRole("menuitemradio", { name: "Name" }).click();
  await expect(menu).toHaveCount(0);
  await expect(trigger).toHaveAccessibleName("Sort: Name");
  await expect(reverse).toHaveAccessibleName("Order: A to Z");
  await expect(titles).toHaveText([/^Hero shot/, /^Homepage/, /^Mockups/, /^Pitch deck/]);

  await reverse.click();
  await expect(reverse).toHaveAccessibleName("Order: Z to A");
  await expect(titles).toHaveText([/^Pitch deck/, /^Mockups/, /^Homepage/, /^Hero shot/]);
  // The order shows in words beside the arrow (from sm up) and is announced once changed.
  if ((page.viewportSize()?.width ?? 0) >= 640) await expect(reverse).toHaveText("Z to A");
  await expect(page.getByTestId("sort-status")).toHaveText("Sorted by name. Z to A");

  await page.reload();
  await expect(trigger).toHaveAccessibleName("Sort: Name");
  await expect(reverse).toHaveAccessibleName("Order: Z to A");
  await expect(titles).toHaveText([/^Pitch deck/, /^Mockups/, /^Homepage/, /^Hero shot/]);

  // A new key starts in its own natural order: websites, images (by name), then PDFs.
  await trigger.click();
  await page.getByRole("menuitemradio", { name: "File type" }).click();
  await expect(reverse).toHaveAccessibleName("Order: Websites first");
  await expect(titles).toHaveText([/^Homepage/, /^Hero shot/, /^Mockups/, /^Pitch deck/]);

  // Fits a phone's width without scrolling the page sideways; the open menu passes axe there.
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(reverse).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  await trigger.click();
  const options = page.getByRole("menu", { name: "Sort: File type" });
  await settled(options);
  const menuBox = await options.boundingBox();
  expect(menuBox && menuBox.x >= 0 && menuBox.x + menuBox.width <= 375).toBe(true);
  const axe = await new AxeBuilder({ page }).include("main header").analyze();
  expect(axe.violations.map(({ id, nodes }) => ({ id, nodes: nodes.length }))).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(options).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
